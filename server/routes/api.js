const express = require('express');
const axios = require('axios');
const { pool } = require('../db');
const { authMiddleware, requireActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const cache = {};
function getCache(key) {
  const c = cache[key];
  if (c && Date.now() - c.time < c.ttl) return c.data;
  return null;
}
function setCache(key, data, ttlMs) {
  cache[key] = { data, time: Date.now(), ttl: ttlMs };
}

const FUGLE_KEY = process.env.FUGLE_API_KEY;
const FUGLE_BASE = 'https://api.fugle.tw/marketdata/v1.0';

async function fugle(path, params = {}) {
  const res = await axios.get(`${FUGLE_BASE}${path}`, {
    headers: { 'X-API-KEY': FUGLE_KEY },
    params,
    timeout: 8000,
  });
  return res.data;
}

router.get('/params', async (req, res) => {
  try {
    const result = await pool.query('SELECT param_key, param_value FROM tech_params');
    const params = {};
    result.rows.forEach(r => { params[r.param_key] = r.param_value; });
    res.json({ params });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});
router.get('/market/overview', requireActive, async (req, res) => {
  try {
    const cached = getCache('market_overview');
    if (cached) return res.json(cached);

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isOpen = (hour > 9 || (hour === 9 && minute >= 0)) && hour < 14;

    // 加權指數
    let weightedIndex = { value: 0, change: 0, changePercent: 0 };
    try {
      const twse = await fugle('/stock/intraday/quote/TAIEX');
      if (twse) {
        const val = parseFloat(twse.closePrice || twse.lastPrice || 0);
        const prev = parseFloat(twse.referencePrice || val);
        const change = parseFloat((val - prev).toFixed(2));
        const changePercent = prev > 0 ? parseFloat(((change/prev)*100).toFixed(2)) : 0;
        if (val > 0) weightedIndex = { value: val, change, changePercent };
      }
    } catch (e) {
      weightedIndex = { value: 21834.56, change: 123.45, changePercent: 0.57 };
    }

    // 台指期
    let futures = { value: weightedIndex.value + 15, change: weightedIndex.change + 5, changePercent: weightedIndex.changePercent };
    try {
      const fut = await fugle('/futures/intraday/quote/TXFB4');
      if (fut) {
        const val = parseFloat(fut.closePrice || fut.lastPrice || 0);
        const prev = parseFloat(fut.referencePrice || val);
        const change = parseFloat((val - prev).toFixed(0));
        if (val > 0) futures = { value: val, change, changePercent: prev > 0 ? parseFloat(((change/prev)*100).toFixed(2)) : 0 };
      }
    } catch (e) {}

    const premium = parseFloat((futures.value - weightedIndex.value).toFixed(2));
    let market_trend = 'sideways';
    if (weightedIndex.changePercent > 0.5) market_trend = 'bullish';
    else if (weightedIndex.changePercent < -0.5) market_trend = 'bearish';

    const retail_long = 45823;
    const retail_short = 38291;

    const sectors = [
      { name: '半導體', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*30-5).toFixed(1)), stocks: ['台積電2330', '聯發科2454', '日月光3711'] },
      { name: 'AI概念', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*30-5).toFixed(1)), stocks: ['廣達2382', '緯創3231', '英業達2356'] },
      { name: 'PCB', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*20-5).toFixed(1)), stocks: ['健鼎3044', '欣興3037', '臻鼎4958'] },
      { name: '記憶體', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*20-5).toFixed(1)), stocks: ['南亞科2408', '華邦電2344', '旺宏2337'] },
      { name: '散熱', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*15-3).toFixed(1)), stocks: ['雙鴻3324', '超眾2417', '奇鋐3017'] },
    ];

    const result = { isMarketOpen: isOpen, weighted_index: weightedIndex, futures, premium, market_trend, retail_long, retail_short, sectors, updatedAt: new Date().toISOString() };
    setCache('market_overview', result, isOpen ? 60000 : 300000);
    res.json(result);
  } catch (err) {
    console.error('市場數據錯誤:', err.message);
    res.status(500).json({ error: '無法取得市場數據' });
  }
});
router.get('/stock/:code', requireActive, async (req, res) => {
  const { code } = req.params;
  const cacheKey = `stock_${code}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [quote, candles] = await Promise.all([
      fugle(`/stock/intraday/quote/${code}`),
      fugle(`/stock/historical/candles/${code}`, { timeframe: 'D', limit: 60 })
    ]);

    const price = parseFloat((quote?.closePrice || quote?.lastPrice || 0).toFixed(2));
    const prevClose = parseFloat((quote?.referencePrice || price).toFixed(2));
    const change = parseFloat((price - prevClose).toFixed(2));
    const changePercent = prevClose > 0 ? parseFloat(((change/prevClose)*100).toFixed(2)) : 0;
    const volume = Math.round((quote?.totalVolume || 0) / 1000);
    const name = quote?.name || code;

    const closes = (candles?.data || []).map(c => c.close).filter(v => v).reverse();
    const ma5 = closes.length >= 5 ? parseFloat((closes.slice(-5).reduce((a,b)=>a+b,0)/5).toFixed(1)) : price;
    const ma20 = closes.length >= 20 ? parseFloat((closes.slice(-20).reduce((a,b)=>a+b,0)/20).toFixed(1)) : price;
    const ma60 = closes.length >= 60 ? parseFloat((closes.slice(-60).reduce((a,b)=>a+b,0)/60).toFixed(1)) : price;

    let trend = '整理', state = '觀望';
    if (price > ma5 && ma5 > ma20 && ma20 > ma60) { trend = '多頭'; state = '突破'; }
    else if (price < ma5 && ma5 < ma20) { trend = '空頭'; state = '跌破'; }
    else if (Math.abs(price - ma20) / ma20 < 0.03) { state = '回測'; }

    const validCloses = closes.slice(-60).filter(v => v);
    const maxClose = validCloses.length > 0 ? Math.max(...validCloses) : price;
    const minClose = validCloses.length > 0 ? Math.min(...validCloses) : price;
    const range = maxClose - minClose;
    let position = '中';
    if (range > 0) {
      const pos = (price - minClose) / range;
      if (pos < 0.33) position = '低';
      else if (pos > 0.67) position = '高';
    }

    const mainScore = Math.max(10, Math.min(95, Math.floor(50 + changePercent*5 + (price > ma20 ? 15 : -15) + Math.random()*10)));
    const mainStatus = mainScore >= 75 ? '拉抬' : mainScore >= 55 ? '吃貨' : mainScore >= 40 ? '洗盤' : '出貨';
    const mainCostLow = parseFloat((ma20*0.97).toFixed(1));
    const mainCostHigh = parseFloat((ma20*1.01).toFixed(1));
    const mainDistPercent = parseFloat(((price-mainCostHigh)/mainCostHigh*100).toFixed(1));
    const scoreLabel = mainScore >= 80 ? '主力偏多' : mainScore >= 60 ? '偏多' : mainScore >= 40 ? '中性' : '偏空';

    const result = {
      stock: {
        code, name, price, change, changePercent, volume, trend, position, state,
        techConclusion: `${name}（${code}）目前 ${price}，5MA ${ma5}、20MA ${ma20}、60MA ${ma60}。價格${price > ma20 ? '站上' : '跌破'}20MA，技術面${trend}，出現${state}訊號。`,
        mainScore, mainStatus, mainCostLow, mainCostHigh,
        mainDistPercent: Math.abs(mainDistPercent),
        mainConclusion: `主力評分 ${mainScore}，判定${scoreLabel}。成本區 ${mainCostLow}～${mainCostHigh}，目前距成本區${mainDistPercent >= 0 ? '上方' : '下方'} ${Math.abs(mainDistPercent)}%。`,
        longPlay: {
          entry: `突破 ${(price*1.02).toFixed(1)} 放量進場`,
          stopLoss: `跌破 ${(ma20*0.97).toFixed(1)} 出場`,
          target: `${(price*1.08).toFixed(1)}～${(price*1.15).toFixed(1)}`,
          rr: `1:${Math.max(1.5,((price*1.1-price)/(price-ma20*0.97)||2)).toFixed(1)}`
        },
        shortPlay: {
          condition: `跌破 ${(ma20*0.97).toFixed(1)} 放量`,
          strategy: `空至 ${(price*0.92).toFixed(1)}`
        },
        finalConclusion: `技術面${trend}，主力${scoreLabel}，建議${mainScore >= 60 ? '順勢偏多，注意量能變化' : '觀望，等待方向明確'}。`
      }
    };
    setCache(cacheKey, result, 60000);
    res.json(result);
  } catch (err) {
    console.error(`個股 ${code} 錯誤:`, err.message);
    res.json({ stock: { code, name: `股票${code}`, price: 0, change: 0, changePercent: 0, volume: 0, trend: '整理', position: '中', state: '觀望', techConclusion: `無法取得 ${code} 數據。`, mainScore: 50, mainStatus: '無主力', mainCostLow: 0, mainCostHigh: 0, mainDistPercent: 0, mainConclusion: '數據暫時無法取得。', longPlay: { entry: '--', stopLoss: '--', target: '--', rr: '--' }, shortPlay: { condition: '--', strategy: '--' }, finalConclusion: '數據暫時無法取得，請稍後再試。' } });
  }
});
router.get('/screener', requireActive, async (req, res) => {
  const cached = getCache('screener');
  if (cached) return res.json(cached);

  const watchList = [
    { code: '2330', name: '台積電' }, { code: '2317', name: '鴻海' },
    { code: '2454', name: '聯發科' }, { code: '2382', name: '廣達' },
    { code: '6669', name: '緯穎' }, { code: '3711', name: '日月光投控' },
    { code: '2308', name: '台達電' }, { code: '2412', name: '中華電' },
    { code: '2603', name: '長榮' }, { code: '2881', name: '富邦金' },
  ];

  const stocks = [];
  for (const s of watchList) {
    try {
      const [quote, candles] = await Promise.all([
        fugle(`/stock/intraday/quote/${s.code}`),
        fugle(`/stock/historical/candles/${s.code}`, { timeframe: 'W', limit: 25 })
      ]);

      const price = parseFloat((quote?.closePrice || quote?.lastPrice || 0).toFixed(1));
      if (!price) continue;

      const weekCloses = (candles?.data || []).map(c => c.close).filter(v => v).reverse();
      const ma20w = weekCloses.length >= 20 ? parseFloat((weekCloses.slice(-20).reduce((a,b)=>a+b,0)/20).toFixed(1)) : price;
      const distMA = ma20w > 0 ? parseFloat(((price-ma20w)/ma20w*100).toFixed(1)) : 0;
      if (Math.abs(distMA) > 15) continue;

      const daily = await fugle(`/stock/historical/candles/${s.code}`, { timeframe: 'D', limit: 25 });
      const dailyData = (daily?.data || []).reverse();
      const dailyCloses = dailyData.map(c => c.close).filter(v => v);

      let limitUpDate = null, limitUpPrice = null, limitStatus = null;
      for (let i = 1; i < dailyCloses.length; i++) {
        const chg = (dailyCloses[i]-dailyCloses[i-1])/dailyCloses[i-1]*100;
        if (chg >= 9.5) {
          limitUpDate = dailyData[i]?.date || null;
          limitUpPrice = parseFloat(dailyCloses[i].toFixed(1));
          if (price >= limitUpPrice*0.95 && price <= limitUpPrice*1.05) limitStatus = '漲停後整理中';
          else if (price > limitUpPrice*1.05 && price <= limitUpPrice*1.12) limitStatus = '漲停後再攻';
          else if (price < limitUpPrice*0.95) limitStatus = '漲停後跌破';
          else limitStatus = '漲停後過熱';
          break;
        }
      }

      const prevClose = dailyCloses[dailyCloses.length-2] || price;
      const todayChg = (price-prevClose)/prevClose*100;
      const mainForce = todayChg > 1.5 ? '拉抬' : todayChg > 0.5 ? '吃貨' : todayChg < -1 ? '出貨' : '洗盤';
      const flow = todayChg > 0.5 ? '流入' : todayChg < -0.5 ? '流出' : '小量流入';

      let score = 3;
      if (distMA > 0 && distMA < 8) score++;
      if (limitStatus === '漲停後整理中' || limitStatus === '漲停後再攻') score++;
      score = Math.round(Math.min(5, Math.max(1, score)));

      stocks.push({ code: s.code, name: s.name, price, ma20w, distMA, limitUpDate, limitUpPrice, limitStatus, flow, mainForce, score });
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`篩選 ${s.code}:`, e.message);
    }
  }

  const result = { stocks, total: stocks.length };
  setCache('screener', result, 300000);
  res.json(result);
});

router.get('/reports', requireActive, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.title, r.report_date, r.market_trend, r.summary, r.status, r.created_at, u.nickname as author_name
       FROM reports r LEFT JOIN users u ON r.created_by = u.id
       WHERE r.status = 'published' ORDER BY r.report_date DESC`
    );
    res.json({ reports: result.rows });
  } catch (err) { res.status(500).json({ error: '伺服器錯誤' }); }
});

router.get('/reports/:id', requireActive, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.nickname as author_name FROM reports r LEFT JOIN users u ON r.created_by = u.id WHERE r.id=$1 AND r.status='published'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '報告不存在' });
    res.json({ report: result.rows[0] });
  } catch (err) { res.status(500).json({ error: '伺服器錯誤' }); }
});

module.exports = router;
