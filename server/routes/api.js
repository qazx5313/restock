const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireActive } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 取得已發布報告（需 active）
router.get('/reports', requireActive, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.title, r.report_date, r.market_trend, r.summary, r.status, r.created_at,
              u.nickname as author_name
       FROM reports r LEFT JOIN users u ON r.created_by = u.id
       WHERE r.status = 'published'
       ORDER BY r.report_date DESC`
    );
    res.json({ reports: result.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.get('/reports/:id', requireActive, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.nickname as author_name
       FROM reports r LEFT JOIN users u ON r.created_by = u.id
       WHERE r.id=$1 AND r.status='published'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '報告不存在' });
    res.json({ report: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 取得技術參數（全站共用）
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

// 大盤模擬數據（實際應接 API）
router.get('/market/overview', requireActive, async (req, res) => {
  // 模擬數據，實際應串接 twstock API 或爬蟲
  const now = new Date();
  const hour = now.getHours();
  const isOpen = hour >= 9 && hour < 14;

  res.json({
    isMarketOpen: isOpen,
    weighted_index: { value: 21834.56, change: 123.45, changePercent: 0.57 },
    futures: { value: 21850, change: 142, changePercent: 0.65 },
    premium: 15.44,
    market_trend: 'bullish',
    retail_long: 45823,
    retail_short: 38291,
    sectors: [
      { name: '記憶體', change: 2.34, flow: 18.5, stocks: ['南亞科', '華邦電', '旺宏'] },
      { name: 'PCB', change: 1.87, flow: 12.3, stocks: ['健鼎', '欣興', '臻鼎-KY'] },
      { name: 'AI概念', change: 3.21, flow: 35.8, stocks: ['廣達', '緯創', '英業達'] },
      { name: '玻纖布', change: -0.45, flow: -5.2, stocks: ['台燿', '聯茂', '台光電'] },
      { name: '散熱', change: 1.56, flow: 8.7, stocks: ['雙鴻', '超眾', '奇鋐'] },
    ]
  });
});

// 模擬股票篩選數據
router.get('/screener', requireActive, async (req, res) => {
  const mockStocks = [
    { code: '2330', name: '台積電', price: 945, ma20w: 892.3, distMA: 5.9, limitUpDate: '2024-01-15', limitUpPrice: 915, limitStatus: '漲停後整理中', flow: '流入', mainForce: '吃貨', score: 4 },
    { code: '2317', name: '鴻海', price: 182.5, ma20w: 171.2, distMA: 6.6, limitUpDate: '2024-01-18', limitUpPrice: 178, limitStatus: '漲停後再攻', flow: '大量流入', mainForce: '拉抬', score: 5 },
    { code: '2454', name: '聯發科', price: 1125, ma20w: 1072.4, distMA: 4.9, limitUpDate: null, limitUpPrice: null, limitStatus: null, flow: '流入', mainForce: '洗盤', score: 3 },
    { code: '2382', name: '廣達', price: 312, ma20w: 295.6, distMA: 5.5, limitUpDate: '2024-01-20', limitUpPrice: 305, limitStatus: '漲停後整理中', flow: '流入', mainForce: '吃貨', score: 4 },
    { code: '3711', name: '日月光投控', price: 145.5, ma20w: 138.2, distMA: 5.3, limitUpDate: null, limitUpPrice: null, limitStatus: null, flow: '小量流入', mainForce: '無主力', score: 2 },
    { code: '6669', name: '緯穎', price: 2890, ma20w: 2712.5, distMA: 6.5, limitUpDate: '2024-01-22', limitUpPrice: 2820, limitStatus: '漲停後再攻', flow: '大量流入', mainForce: '拉抬', score: 5 },
  ];
  res.json({ stocks: mockStocks, total: mockStocks.length });
});

// 模擬個股分析
router.get('/stock/:code', requireActive, async (req, res) => {
  const { code } = req.params;
  const mockData = {
    code,
    name: code === '2330' ? '台積電' : `股票${code}`,
    price: 945,
    change: 12.5,
    changePercent: 1.34,
    volume: 38521,
    trend: '多頭',
    position: '中',
    state: '突破',
    techConclusion: `${code} 目前站上周20MA，近期量能放大，技術面偏多。布林通道向上擴張，短線支撐在920附近，壓力在965。`,
    mainScore: 78,
    mainStatus: '拉抬',
    mainCostLow: 892,
    mainCostHigh: 921,
    mainDistPercent: 2.6,
    mainConclusion: '主力目前處於拉抬階段，籌碼集中度提升，建議順勢操作。',
    longPlay: {
      entry: '突破965放量進場',
      stopLoss: '跌破920出場',
      target: '1020-1050',
      rr: '1:2.8'
    },
    shortPlay: {
      condition: '跌破920成交量放大',
      strategy: '空至890支撐區'
    },
    finalConclusion: '技術+籌碼共振偏多，主力成本區有支撐，可考慮中多操作。'
  };
  res.json({ stock: mockData });
});

module.exports = router;
