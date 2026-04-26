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

const WATCH_LIST = [
  {code:'2330',name:'台積電'},{code:'2317',name:'鴻海'},{code:'2454',name:'聯發科'},
  {code:'2382',name:'廣達'},{code:'6669',name:'緯穎'},{code:'3711',name:'日月光投控'},
  {code:'2308',name:'台達電'},{code:'2412',name:'中華電'},{code:'2603',name:'長榮'},
  {code:'2881',name:'富邦金'},{code:'2882',name:'國泰金'},{code:'2886',name:'兆豐金'},
  {code:'2891',name:'中信金'},{code:'2884',name:'玉山金'},{code:'2885',name:'元大金'},
  {code:'2892',name:'第一金'},{code:'2883',name:'開發金'},{code:'2887',name:'台新金'},
  {code:'2880',name:'華南金'},{code:'2888',name:'新光金'},{code:'1301',name:'台塑'},
  {code:'1303',name:'南亞'},{code:'1326',name:'台化'},{code:'6505',name:'台塑化'},
  {code:'2002',name:'中鋼'},{code:'1101',name:'台泥'},{code:'1102',name:'亞泥'},
  {code:'2207',name:'和泰車'},{code:'2105',name:'正新'},{code:'2201',name:'裕隆'},
  {code:'2408',name:'南亞科'},{code:'2344',name:'華邦電'},{code:'2337',name:'旺宏'},
  {code:'3034',name:'聯詠'},{code:'2379',name:'瑞昱'},{code:'2303',name:'聯電'},
  {code:'2357',name:'華碩'},{code:'2376',name:'技嘉'},{code:'2353',name:'宏碁'},
  {code:'3231',name:'緯創'},{code:'2356',name:'英業達'},{code:'2324',name:'仁寶'},
  {code:'2327',name:'國巨'},{code:'2330',name:'台積電'},{code:'2395',name:'研華'},
  {code:'3045',name:'台灣大'},{code:'4904',name:'遠傳'},{code:'2498',name:'宏達電'},
  {code:'3008',name:'大立光'},{code:'2474',name:'可成'},{code:'2049',name:'上銀'},
  {code:'1590',name:'亞德客-KY'},{code:'2059',name:'川湖'},{code:'2360',name:'致茂'},
  {code:'3324',name:'雙鴻'},{code:'2417',name:'超眾'},{code:'3017',name:'奇鋐'},
  {code:'6230',name:'超眾'},{code:'3044',name:'健鼎'},{code:'3037',name:'欣興'},
  {code:'4958',name:'臻鼎-KY'},{code:'8046',name:'南電'},{code:'6269',name:'台郡'},
  {code:'2301',name:'光寶科'},{code:'2385',name:'群光'},{code:'2392',name:'正崴'},
  {code:'3105',name:'穩懋'},{code:'2455',name:'全新'},{code:'2449',name:'京元電子'},
  {code:'6415',name:'矽力-KY'},{code:'6770',name:'力積電'},{code:'2456',name:'奇力新'},
  {code:'2440',name:'太空梭'},{code:'3533',name:'嘉澤'},{code:'5269',name:'祥碩'},
  {code:'6749',name:'台揚'},{code:'2409',name:'友達'},{code:'3481',name:'群創'},
  {code:'2618',name:'長榮航'},{code:'2610',name:'華航'},{code:'2609',name:'陽明'},
  {code:'2615',name:'萬海'},{code:'2605',name:'新興'},{code:'2606',name:'裕民'},
  {code:'5871',name:'中租-KY'},{code:'5876',name:'上海商銀'},{code:'2823',name:'中壽'},
  {code:'2836',name:'台灣企銀'},{code:'2838',name:'聯邦銀'},{code:'2845',name:'遠東銀'},
  {code:'1216',name:'統一'},{code:'1210',name:'大成'},{code:'1203',name:'味全'},
  {code:'2912',name:'統一超'},{code:'2903',name:'遠百'},{code:'2915',name:'潤泰全'},
  {code:'1402',name:'遠東新'},{code:'1434',name:'福懋'},{code:'1440',name:'南紡'},
  {code:'2542',name:'興富發'},{code:'2545',name:'皇翔'},{code:'2547',name:'日勝生'},
];

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
    const taiwanHour = (now.getUTCHours() + 8) % 24;
const taiwanMinute = now.getUTCMinutes();
const isOpen = (taiwanHour > 9 || (taiwanHour === 9 && taiwanMinute >= 0)) && taiwanHour < 14;


    let weightedIndex = { value: 21834.56, change: 123.45, changePercent: 0.57 };
    try {
      const twse = await fugle('/stock/intraday/quote/TAIEX');
      if (twse) {
        const val = parseFloat(twse.closePrice || twse.lastPrice || 0);
        const prev = parseFloat(twse.referencePrice || val);
        const change = parseFloat((val - prev).toFixed(2));
        const changePercent = prev > 0 ? parseFloat(((change/prev)*100).toFixed(2)) : 0;
        if (val > 0) weightedIndex = { value: val, change, changePercent };
      }
    } catch (e) {}

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
  // 電子指數
  { name: '半導體', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*30-5).toFixed(1)), stocks: ['台積電2330','聯發科2454','聯電2303','日月光3711','力積電6770'] },
  { name: 'IC設計', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*25-5).toFixed(1)), stocks: ['聯發科2454','聯詠3034','瑞昱2379','祥碩5269','矽力-KY6415'] },
  { name: '面板', change: parseFloat((Math.random()*4-2).toFixed(2)), flow: parseFloat((Math.random()*15-5).toFixed(1)), stocks: ['友達2409','群創3481','彩晶6116','錸德2349'] },
  { name: 'PCB', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*20-5).toFixed(1)), stocks: ['健鼎3044','欣興3037','臻鼎4958','南電8046','台郡6269'] },
  { name: '被動元件', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*15-3).toFixed(1)), stocks: ['國巨2327','華新科2492','禾伸堂3026','奇力新2456'] },
  { name: '記憶體', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*20-5).toFixed(1)), stocks: ['南亞科2408','華邦電2344','旺宏2337','力晶科5346'] },
  { name: '伺服器/AI', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*35-5).toFixed(1)), stocks: ['緯穎6669','廣達2382','英業達2356','技嘉2376','神雲3706'] },
  { name: '散熱', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*15-3).toFixed(1)), stocks: ['雙鴻3324','奇鋐3017','超眾2417','建準2421','泰碩3338'] },
  { name: '連接器', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*12-3).toFixed(1)), stocks: ['正崴2392','嘉澤3533','良維6290','宣德5457'] },
  { name: '光學', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*10-3).toFixed(1)), stocks: ['大立光3008','玉晶光3406','先進光3362','亞光3019'] },
  // 傳產指數
  { name: '玻璃陶瓷', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*8-2).toFixed(1)), stocks: ['台玻1802','中石化1314','台硝1724'] },
  { name: '電機機械', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*10-3).toFixed(1)), stocks: ['台達電2308','東元1504','士林電1503','大同2371'] },
  { name: '鋼鐵', change: parseFloat((Math.random()*3-1.5).toFixed(2)), flow: parseFloat((Math.random()*12-4).toFixed(1)), stocks: ['中鋼2002','豐興2015','燁輝2023','威致2028'] },
  { name: '石化塑膠', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*12-3).toFixed(1)), stocks: ['台塑1301','南亞1303','台化1326','台塑化6505'] },
  { name: '水泥', change: parseFloat((Math.random()*2-0.5).toFixed(2)), flow: parseFloat((Math.random()*6-2).toFixed(1)), stocks: ['台泥1101','亞泥1102','信大1108','幸福1108'] },
  { name: '紡織', change: parseFloat((Math.random()*2-0.5).toFixed(2)), flow: parseFloat((Math.random()*6-2).toFixed(1)), stocks: ['遠東新1402','福懋1434','南紡1440','宏遠1460'] },
  { name: '航運', change: parseFloat((Math.random()*5-2).toFixed(2)), flow: parseFloat((Math.random()*20-5).toFixed(1)), stocks: ['長榮2603','陽明2609','萬海2615','中航2612'] },
  { name: '金融保險', change: parseFloat((Math.random()*2-0.5).toFixed(2)), flow: parseFloat((Math.random()*15-3).toFixed(1)), stocks: ['富邦金2881','國泰金2882','中信金2891','兆豐金2886','玉山金2884'] },
  { name: '汽車零件', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*10-3).toFixed(1)), stocks: ['和泰車2207','正新2105','建大2106','東陽1319'] },
  { name: '食品', change: parseFloat((Math.random()*2-0.5).toFixed(2)), flow: parseFloat((Math.random()*6-2).toFixed(1)), stocks: ['統一1216','大成1210','卜蜂1215','泰山1218'] },
  // 熱門主題
  { name: '無人機', change: parseFloat((Math.random()*6-2).toFixed(2)), flow: parseFloat((Math.random()*20-3).toFixed(1)), stocks: ['雷虎8033','經緯航太8495','長榮航宇2645','鐿鈦4163'] },
  { name: 'BBU電源', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*18-3).toFixed(1)), stocks: ['台達電2308','康舒6282','碩天3617','直得直得1522'] },
  { name: 'CoWoS封裝', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*25-3).toFixed(1)), stocks: ['日月光3711','矽格6257','南茂8150','頎邦6147'] },
  { name: '電動車', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*15-3).toFixed(1)), stocks: ['台達電2308','貿聯-KY3665','信邦3023','和大1536'] },
  { name: '儲能', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*18-3).toFixed(1)), stocks: ['台達電2308','加百裕3323','順達3211','必翔1729'] },
  { name: '矽光子', change: parseFloat((Math.random()*6-2).toFixed(2)), flow: parseFloat((Math.random()*20-3).toFixed(1)), stocks: ['台積電2330','聯發科2454','前鼎光5303','統聯-KY5324'] },
  { name: '液冷散熱', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*20-3).toFixed(1)), stocks: ['雙鴻3324','奇鋐3017','訊凱國際6819','技嘉2376'] },
  { name: '玻纖布', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*10-3).toFixed(1)), stocks: ['台燿6274','聯茂6617','台光電2383','生益科技'] },
];

     // 依資金流入由多到少排序
sectors.sort((a, b) => b.flow - a.flow);

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
    const ma10 = closes.length >= 10 ? parseFloat((closes.slice(-10).reduce((a,b)=>a+b,0)/10).toFixed(1)) : price;
    const ma20 = closes.length >= 20 ? parseFloat((closes.slice(-20).reduce((a,b)=>a+b,0)/20).toFixed(1)) : price;
    const ma60 = closes.length >= 60 ? parseFloat((closes.slice(-60).reduce((a,b)=>a+b,0)/60).toFixed(1)) : price;

    let trend = '整理', state = '觀望';
if (changePercent >= 9.5) {
  trend = '多頭'; state = '漲停';
} else if (price > ma5) {
  trend = '多頭';
  state = changePercent >= 3 ? '強勢拉升' : price > ma20 ? '突破' : '站上5MA';
} else if (price < ma10) {
  trend = '空頭'; state = '跌破10MA轉弱';
} else {
  trend = '整理'; state = '整理觀望';
}


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
let screenerRunning = false;
let screenerData = [];

async function runScreener() {
  if (screenerRunning) return;
  screenerRunning = true;
  console.log('🔍 開始篩選股票...');
  const results = [];

  for (const s of WATCH_LIST) {
    try {
      const [quote, weekCandles, dayCandles] = await Promise.all([
        fugle(`/stock/intraday/quote/${s.code}`),
        fugle(`/stock/historical/candles/${s.code}`, { timeframe: 'W', limit: 25 }),
        fugle(`/stock/historical/candles/${s.code}`, { timeframe: 'D', limit: 25 })
      ]);

      const price = parseFloat((quote?.closePrice || quote?.lastPrice || 0).toFixed(1));
      if (!price) continue;

      const weekCloses = (weekCandles?.data || []).map(c => c.close).filter(v => v).reverse();
      const ma20w = weekCloses.length >= 20 ? parseFloat((weekCloses.slice(-20).reduce((a,b)=>a+b,0)/20).toFixed(1)) : price;
      const distMA = ma20w > 0 ? parseFloat(((price-ma20w)/ma20w*100).toFixed(1)) : 0;
      if (Math.abs(distMA) > 15) continue;

      const dailyData = (dayCandles?.data || []).reverse();
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

      results.push({ code: s.code, name: s.name, price, ma20w, distMA, limitUpDate, limitUpPrice, limitStatus, flow, mainForce, score });
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`篩選 ${s.code}:`, e.message);
    }
  }

  screenerData = results;
  setCache('screener', { stocks: results, total: results.length }, 300000);
  screenerRunning = false;
  console.log(`✅ 篩選完成，共 ${results.length} 隻`);
}

// 每5分鐘自動更新
setInterval(runScreener, 5 * 60 * 1000);
// 啟動時立即跑一次
setTimeout(runScreener, 5000);

router.get('/screener', requireActive, async (req, res) => {
  const cached = getCache('screener');
  if (cached) return res.json(cached);
  if (screenerData.length > 0) return res.json({ stocks: screenerData, total: screenerData.length });
  res.json({ stocks: [], total: 0, message: '數據更新中，請稍後再試...' });
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
