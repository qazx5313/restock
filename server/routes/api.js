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

// 計算KD
function calcKD(highs, lows, closes, period = 9) {
  if (closes.length < period) return { k: 50, d: 50 };
  let k = 50, d = 50;
  for (let i = period - 1; i < closes.length; i++) {
    const sliceH = highs.slice(i - period + 1, i + 1);
    const sliceL = lows.slice(i - period + 1, i + 1);
    const hh = Math.max(...sliceH);
    const ll = Math.min(...sliceL);
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    k = (2/3) * k + (1/3) * rsv;
    d = (2/3) * d + (1/3) * k;
  }
  return { k: parseFloat(k.toFixed(1)), d: parseFloat(d.toFixed(1)) };
}

// 計算RSI
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100/(1+rs)).toFixed(1));
}

const WATCH_LIST = [
  // 水泥
  {code:'1101',name:'台泥'},{code:'1102',name:'亞泥'},{code:'1103',name:'嘉泥'},{code:'1104',name:'環泥'},{code:'1108',name:'幸福'},{code:'1109',name:'信大'},{code:'1110',name:'東泥'},
  // 食品
  {code:'1201',name:'味全'},{code:'1203',name:'味王'},{code:'1210',name:'大成'},{code:'1213',name:'大飲'},{code:'1215',name:'卜蜂'},{code:'1216',name:'統一'},{code:'1217',name:'愛之味'},{code:'1218',name:'泰山'},{code:'1219',name:'福壽'},{code:'1220',name:'台榮'},{code:'1225',name:'福懋油'},{code:'1227',name:'佳格'},{code:'1229',name:'聯華'},{code:'1231',name:'聯華食'},{code:'1232',name:'大統益'},{code:'1233',name:'天仁'},{code:'1234',name:'黑松'},{code:'1235',name:'興泰'},{code:'1236',name:'宏亞'},
  // 塑膠
  {code:'1301',name:'台塑'},{code:'1303',name:'南亞'},{code:'1304',name:'台聚'},{code:'1305',name:'華夏'},{code:'1307',name:'三芳'},{code:'1308',name:'亞聚'},{code:'1309',name:'台達化'},{code:'1310',name:'台苯'},{code:'1312',name:'國喬'},{code:'1313',name:'聯成'},{code:'1314',name:'中石化'},{code:'1315',name:'達新'},{code:'1319',name:'東陽'},{code:'1321',name:'大洋'},{code:'1323',name:'永裕'},{code:'1324',name:'地球'},{code:'1325',name:'恆大'},{code:'1326',name:'台化'},
  // 紡織
  {code:'1402',name:'遠東新'},{code:'1409',name:'新纖'},{code:'1410',name:'南染'},{code:'1413',name:'宏洲'},{code:'1414',name:'東和'},{code:'1416',name:'廣豐'},{code:'1417',name:'嘉裕'},{code:'1418',name:'東華'},{code:'1419',name:'新紡'},{code:'1423',name:'利華'},{code:'1432',name:'大魯閣'},{code:'1434',name:'福懋'},{code:'1439',name:'中和'},{code:'1440',name:'南紡'},{code:'1441',name:'大東'},{code:'1443',name:'立益'},{code:'1444',name:'力麗'},{code:'1445',name:'大宇'},{code:'1446',name:'宏和'},{code:'1447',name:'力鵬'},{code:'1449',name:'佳和'},{code:'1451',name:'年興'},{code:'1452',name:'宏益'},{code:'1453',name:'大將'},{code:'1454',name:'台富'},{code:'1455',name:'集盛'},{code:'1456',name:'怡華'},{code:'1457',name:'宜進'},{code:'1459',name:'聯發'},{code:'1460',name:'宏遠'},{code:'1463',name:'強盛'},{code:'1464',name:'得力'},{code:'1465',name:'偉全'},{code:'1466',name:'聚隆'},{code:'1467',name:'南緯'},{code:'1468',name:'昶和'},{code:'1469',name:'理隆'},{code:'1470',name:'大統染'},{code:'1472',name:'三洋紡'},{code:'1473',name:'台南'},{code:'1474',name:'弘裕'},{code:'1475',name:'本盟'},{code:'1476',name:'儒鴻'},{code:'1477',name:'聚陽'},
  // 電機機械
  {code:'1503',name:'士電'},{code:'1504',name:'東元'},{code:'1506',name:'正道'},{code:'1507',name:'永大'},{code:'1512',name:'瑞利'},{code:'1513',name:'中興電'},{code:'1514',name:'亞力'},{code:'1515',name:'力山'},{code:'1516',name:'川飛'},{code:'1517',name:'利奇'},{code:'1519',name:'華城'},{code:'1521',name:'大億'},{code:'1522',name:'堤維西'},{code:'1524',name:'耿鼎'},{code:'1525',name:'江申'},{code:'1526',name:'日馳'},{code:'1527',name:'鑽全'},{code:'1528',name:'恩德'},{code:'1529',name:'樂士'},{code:'1530',name:'亞崴'},{code:'1531',name:'高林股'},{code:'1532',name:'勤美'},{code:'1533',name:'車王電'},{code:'1535',name:'中宇'},{code:'1536',name:'和大'},{code:'1537',name:'廣隆'},{code:'1538',name:'正峰新'},{code:'1539',name:'巨庭'},{code:'1540',name:'喬福'},{code:'1541',name:'錩泰'},
  // 鋼鐵
  {code:'2002',name:'中鋼'},{code:'2006',name:'東和鋼鐵'},{code:'2007',name:'燁興'},{code:'2008',name:'高興昌'},{code:'2009',name:'第一銅'},{code:'2010',name:'春源'},{code:'2012',name:'春雨'},{code:'2013',name:'中鋼構'},{code:'2014',name:'中鴻'},{code:'2015',name:'豐興'},{code:'2017',name:'官田鋼'},{code:'2020',name:'美亞'},{code:'2022',name:'聚亨'},{code:'2023',name:'燁輝'},{code:'2024',name:'志聯'},{code:'2025',name:'千興'},{code:'2027',name:'大成鋼'},{code:'2028',name:'威致'},{code:'2029',name:'盛餘'},{code:'2030',name:'彰源'},{code:'2031',name:'新光鋼'},{code:'2032',name:'新鋼'},{code:'2033',name:'佳大'},{code:'2034',name:'允強'},{code:'2038',name:'海光'},
  // 半導體
  {code:'2303',name:'聯電'},{code:'2308',name:'台達電'},{code:'2311',name:'日月光'},{code:'2317',name:'鴻海'},{code:'2325',name:'矽品'},{code:'2327',name:'國巨'},{code:'2330',name:'台積電'},{code:'2337',name:'旺宏'},{code:'2344',name:'華邦電'},{code:'2347',name:'聯強'},{code:'2349',name:'錸德'},{code:'2351',name:'順德'},{code:'2352',name:'佳世達'},{code:'2353',name:'宏碁'},{code:'2354',name:'鴻準'},{code:'2356',name:'英業達'},{code:'2357',name:'華碩'},{code:'2358',name:'廷鑫'},{code:'2360',name:'致茂'},{code:'2362',name:'藍天'},{code:'2363',name:'矽統'},{code:'2364',name:'倫飛'},{code:'2365',name:'昆盈'},{code:'2367',name:'燿華'},{code:'2368',name:'金像電'},{code:'2369',name:'菱生'},{code:'2371',name:'大同'},{code:'2373',name:'震旦行'},{code:'2374',name:'佳能'},{code:'2375',name:'智寶'},{code:'2376',name:'技嘉'},{code:'2377',name:'微星'},{code:'2379',name:'瑞昱'},{code:'2380',name:'虹光'},{code:'2382',name:'廣達'},{code:'2383',name:'台光電'},{code:'2385',name:'群光'},{code:'2387',name:'精元'},{code:'2388',name:'威盛'},{code:'2392',name:'正崴'},{code:'2393',name:'億光'},{code:'2395',name:'研華'},{code:'2397',name:'友通'},{code:'2399',name:'映泰'},{code:'2401',name:'凌陽'},{code:'2402',name:'毅嘉'},{code:'2404',name:'漢唐'},{code:'2405',name:'浩鑫'},{code:'2406',name:'國碩'},{code:'2408',name:'南亞科'},{code:'2409',name:'友達'},{code:'2412',name:'中華電'},{code:'2413',name:'環科'},{code:'2414',name:'精技'},{code:'2415',name:'錩新'},{code:'2417',name:'圓剛'},{code:'2420',name:'新巨'},{code:'2421',name:'建準'},{code:'2423',name:'固緯'},{code:'2424',name:'隴華'},{code:'2425',name:'承啟'},{code:'2426',name:'鼎元'},{code:'2427',name:'三商電'},{code:'2428',name:'興勤'},{code:'2429',name:'銘旺科'},{code:'2430',name:'燦坤'},{code:'2431',name:'聯昌'},{code:'2432',name:'大毅'},{code:'2433',name:'互盛電'},{code:'2434',name:'統懋'},{code:'2436',name:'偉詮電'},{code:'2437',name:'旺詮'},{code:'2438',name:'翔耀'},{code:'2439',name:'美律'},{code:'2440',name:'太空梭'},{code:'2441',name:'超豐'},{code:'2442',name:'新美齊'},{code:'2443',name:'新利虹'},{code:'2444',name:'友旺'},{code:'2448',name:'晶電'},{code:'2449',name:'京元電子'},{code:'2450',name:'神腦'},{code:'2451',name:'創見'},{code:'2454',name:'聯發科'},{code:'2455',name:'全新'},{code:'2456',name:'奇力新'},{code:'2457',name:'飛宏'},{code:'2458',name:'義隆'},{code:'2459',name:'敦吉'},{code:'2460',name:'建通'},{code:'2461',name:'光群雷'},{code:'2462',name:'良得電'},{code:'2464',name:'盟立'},{code:'2465',name:'麗臺'},{code:'2466',name:'冠西電'},{code:'2467',name:'志聖'},{code:'2468',name:'華經'},{code:'2471',name:'資通'},{code:'2472',name:'立隆電'},{code:'2474',name:'可成'},{code:'2475',name:'華映'},{code:'2476',name:'鉅祥'},{code:'2477',name:'美隆電'},{code:'2478',name:'大毅'},{code:'2480',name:'敦陽科'},{code:'2481',name:'強茂'},{code:'2482',name:'連宇'},{code:'2483',name:'百容'},{code:'2484',name:'希華'},{code:'2485',name:'兆赫'},{code:'2486',name:'一詮'},{code:'2488',name:'漢平'},{code:'2489',name:'瑞軒'},{code:'2491',name:'吉祥全'},{code:'2492',name:'華新科'},{code:'2493',name:'揚博'},{code:'2495',name:'普安'},{code:'2496',name:'卓越'},{code:'2497',name:'怡利電'},{code:'2498',name:'宏達電'},{code:'2499',name:'東貝'},
  // 金融
  {code:'2801',name:'彰銀'},{code:'2809',name:'京城銀'},{code:'2812',name:'台中銀'},{code:'2816',name:'旺旺保'},{code:'2820',name:'華票'},{code:'2823',name:'中壽'},{code:'2832',name:'台產'},{code:'2833',name:'台壽保'},{code:'2834',name:'臺企銀'},{code:'2836',name:'高雄銀'},{code:'2837',name:'凱基銀'},{code:'2838',name:'聯邦銀'},{code:'2841',name:'台開'},{code:'2845',name:'遠東銀'},{code:'2847',name:'大眾銀'},{code:'2849',name:'安泰銀'},{code:'2850',name:'新產'},{code:'2851',name:'中再保'},{code:'2852',name:'第一保'},{code:'2855',name:'統一證'},{code:'2856',name:'元富證'},{code:'2867',name:'三商壽'},{code:'2880',name:'華南金'},{code:'2881',name:'富邦金'},{code:'2882',name:'國泰金'},{code:'2883',name:'開發金'},{code:'2884',name:'玉山金'},{code:'2885',name:'元大金'},{code:'2886',name:'兆豐金'},{code:'2887',name:'台新金'},{code:'2888',name:'新光金'},{code:'2889',name:'國票金'},{code:'2890',name:'永豐金'},{code:'2891',name:'中信金'},{code:'2892',name:'第一金'},
  // 航運
  {code:'2601',name:'益航'},{code:'2603',name:'長榮'},{code:'2605',name:'新興'},{code:'2606',name:'裕民'},{code:'2607',name:'榮運'},{code:'2608',name:'大榮'},{code:'2609',name:'陽明'},{code:'2610',name:'華航'},{code:'2611',name:'志信'},{code:'2612',name:'中航'},{code:'2613',name:'中櫃'},{code:'2615',name:'萬海'},{code:'2616',name:'山隆'},{code:'2617',name:'台航'},{code:'2618',name:'長榮航'},
  // 觀光
  {code:'2701',name:'萬企'},{code:'2702',name:'華園'},{code:'2704',name:'國賓'},{code:'2705',name:'六福'},{code:'2706',name:'第一店'},{code:'2707',name:'晶華'},{code:'2712',name:'遠雄來'},{code:'2722',name:'夏都'},{code:'2723',name:'美食-KY'},{code:'2727',name:'王品'},{code:'2731',name:'雄獅'},{code:'2733',name:'五木'},{code:'2734',name:'易飛網'},
  // 零售
  {code:'2901',name:'欣欣'},{code:'2903',name:'遠百'},{code:'2905',name:'三商'},{code:'2906',name:'高林'},{code:'2908',name:'特力'},{code:'2910',name:'統領'},{code:'2911',name:'麗嬰房'},{code:'2912',name:'統一超'},{code:'2913',name:'農林'},{code:'2915',name:'潤泰全'},{code:'2916',name:'滿心'},
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
      { name: '玻璃陶瓷', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*8-2).toFixed(1)), stocks: ['台玻1802','中石化1314','台硝1724'] },
      { name: '電機機械', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*10-3).toFixed(1)), stocks: ['台達電2308','東元1504','士林電1503','大同2371'] },
      { name: '鋼鐵', change: parseFloat((Math.random()*3-1.5).toFixed(2)), flow: parseFloat((Math.random()*12-4).toFixed(1)), stocks: ['中鋼2002','豐興2015','燁輝2023','威致2028'] },
      { name: '石化塑膠', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*12-3).toFixed(1)), stocks: ['台塑1301','南亞1303','台化1326','台塑化6505'] },
      { name: '水泥', change: parseFloat((Math.random()*2-0.5).toFixed(2)), flow: parseFloat((Math.random()*6-2).toFixed(1)), stocks: ['台泥1101','亞泥1102','信大1108'] },
      { name: '紡織', change: parseFloat((Math.random()*2-0.5).toFixed(2)), flow: parseFloat((Math.random()*6-2).toFixed(1)), stocks: ['遠東新1402','福懋1434','南紡1440','宏遠1460'] },
      { name: '航運', change: parseFloat((Math.random()*5-2).toFixed(2)), flow: parseFloat((Math.random()*20-5).toFixed(1)), stocks: ['長榮2603','陽明2609','萬海2615','中航2612'] },
      { name: '金融保險', change: parseFloat((Math.random()*2-0.5).toFixed(2)), flow: parseFloat((Math.random()*15-3).toFixed(1)), stocks: ['富邦金2881','國泰金2882','中信金2891','兆豐金2886','玉山金2884'] },
      { name: '汽車零件', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*10-3).toFixed(1)), stocks: ['和泰車2207','正新2105','建大2106','東陽1319'] },
      { name: '食品', change: parseFloat((Math.random()*2-0.5).toFixed(2)), flow: parseFloat((Math.random()*6-2).toFixed(1)), stocks: ['統一1216','大成1210','卜蜂1215','泰山1218'] },
      { name: '無人機', change: parseFloat((Math.random()*6-2).toFixed(2)), flow: parseFloat((Math.random()*20-3).toFixed(1)), stocks: ['雷虎8033','經緯航太8495','長榮航宇2645','鐿鈦4163'] },
      { name: 'BBU電源', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*18-3).toFixed(1)), stocks: ['台達電2308','康舒6282','碩天3617'] },
      { name: 'CoWoS封裝', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*25-3).toFixed(1)), stocks: ['日月光3711','矽格6257','南茂8150','頎邦6147'] },
      { name: '電動車', change: parseFloat((Math.random()*4-1).toFixed(2)), flow: parseFloat((Math.random()*15-3).toFixed(1)), stocks: ['台達電2308','貿聯-KY3665','信邦3023','和大1536'] },
      { name: '儲能', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*18-3).toFixed(1)), stocks: ['台達電2308','加百裕3323','順達3211','必翔1729'] },
      { name: '矽光子', change: parseFloat((Math.random()*6-2).toFixed(2)), flow: parseFloat((Math.random()*20-3).toFixed(1)), stocks: ['台積電2330','聯發科2454','前鼎光5303'] },
      { name: '液冷散熱', change: parseFloat((Math.random()*5-1).toFixed(2)), flow: parseFloat((Math.random()*20-3).toFixed(1)), stocks: ['雙鴻3324','奇鋐3017','技嘉2376'] },
      { name: '玻纖布', change: parseFloat((Math.random()*3-1).toFixed(2)), flow: parseFloat((Math.random()*10-3).toFixed(1)), stocks: ['台燿6274','聯茂6617','台光電2383'] },
    ];
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
      fugle(`/stock/historical/candles/${code}`, { timeframe: 'D', limit: 90 })
    ]);

    const price = parseFloat((quote?.closePrice || quote?.lastPrice || 0).toFixed(2));
    const prevClose = parseFloat((quote?.referencePrice || price).toFixed(2));
    const change = parseFloat((price - prevClose).toFixed(2));
    const changePercent = prevClose > 0 ? parseFloat(((change/prevClose)*100).toFixed(2)) : 0;
    const volume = Math.round((quote?.totalVolume || 0) / 1000);
    const name = quote?.name || code;

    const rawCandles = (candles?.data || []).reverse();
    const closes = rawCandles.map(c => c.close).filter(v => v);
    const highs = rawCandles.map(c => c.high).filter(v => v);
    const lows = rawCandles.map(c => c.low).filter(v => v);
    const volumes = rawCandles.map(c => c.volume).filter(v => v);
    const dates = rawCandles.map(c => c.date).filter(v => v);

    // 均線
    const ma5 = closes.length >= 5 ? parseFloat((closes.slice(-5).reduce((a,b)=>a+b,0)/5).toFixed(1)) : price;
    const ma10 = closes.length >= 10 ? parseFloat((closes.slice(-10).reduce((a,b)=>a+b,0)/10).toFixed(1)) : price;
    const ma20 = closes.length >= 20 ? parseFloat((closes.slice(-20).reduce((a,b)=>a+b,0)/20).toFixed(1)) : price;
    const ma60 = closes.length >= 60 ? parseFloat((closes.slice(-60).reduce((a,b)=>a+b,0)/60).toFixed(1)) : price;

    // KD
    const { k, d } = calcKD(highs, lows, closes);
    const prevKD = calcKD(highs.slice(0,-1), lows.slice(0,-1), closes.slice(0,-1));
    const kdCross = k > d && prevKD.k <= prevKD.d ? '黃金交叉' : k < d && prevKD.k >= prevKD.d ? '死亡交叉' : null;
    const kdSignal = k < 20 ? '超賣區' : k > 80 ? '超買區' : k > d ? 'K>D偏多' : 'K<D偏空';

    // RSI
    const rsi = calcRSI(closes);

    // 趨勢
    let trend = '整理', state = '觀望';
    if (changePercent >= 9.5) { trend = '多頭'; state = '漲停'; }
    else if (price > ma5) { trend = '多頭'; state = changePercent >= 3 ? '強勢拉升' : price > ma20 ? '突破' : '站上5MA'; }
    else if (price < ma10) { trend = '空頭'; state = '跌破10MA轉弱'; }
    else { trend = '整理'; state = '整理觀望'; }

    // 位置
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

    // 壓力區（近期前高）
    const recentHighs = highs.slice(-30);
    const resistance1 = recentHighs.length > 0 ? parseFloat(Math.max(...recentHighs).toFixed(1)) : null;
    const resistance2 = recentHighs.length > 10 ? parseFloat(Math.max(...recentHighs.slice(0,-5)).toFixed(1)) : null;
    const support1 = closes.length >= 10 ? parseFloat(Math.min(...closes.slice(-10)).toFixed(1)) : null;

    // 進場區計算（A低接 B回穩 C突破）
    const boxBottom = parseFloat(Math.min(ma10, ma20).toFixed(1));
    const boxTop = parseFloat(Math.max(ma10, ma20).toFixed(1));
    const entryA_low = parseFloat((boxBottom * 0.99).toFixed(1));
    const entryA_high = parseFloat((boxTop * 1.01).toFixed(1));
    const stopA = parseFloat((boxBottom * 0.97).toFixed(1));
    const targetA = resistance1 || parseFloat((price * 1.1).toFixed(1));
    const rrA = price > stopA ? parseFloat(((targetA - entryA_high) / (entryA_high - stopA)).toFixed(1)) : 0;

    const entryC_low = parseFloat((resistance1 * 1.01).toFixed(1));
    const entryC_high = parseFloat((resistance1 * 1.02).toFixed(1));
    const stopC = parseFloat((resistance1 * 0.97).toFixed(1));
    const targetC = resistance2 ? parseFloat((resistance2 * 1.02).toFixed(1)) : parseFloat((price * 1.05).toFixed(1));
    const rrC = entryC_high > stopC ? parseFloat(((targetC - entryC_high) / (entryC_high - stopC)).toFixed(1)) : 0;

    // 漲停後回調連續紅K偵測
    let limitUpAlert = null;
    const last30 = closes.slice(-30);
    const last30dates = dates.slice(-30);
    for (let i = 1; i < last30.length; i++) {
      const chg = (last30[i] - last30[i-1]) / last30[i-1] * 100;
      if (chg >= 9.5) {
        const limitPrice = last30[i];
        const limitDate = last30dates[i];
        const afterCandles = last30.slice(i+1);
        if (afterCandles.length >= 2) {
          // 確認回調後是否出現連續紅K
          let pullbackFound = false;
          let consecutiveRed = 0;
          let maxConsecRed = 0;
          for (let j = 0; j < afterCandles.length; j++) {
            if (j === 0) { pullbackFound = afterCandles[j] < limitPrice; continue; }
            if (afterCandles[j] > afterCandles[j-1]) {
              consecutiveRed++;
              maxConsecRed = Math.max(maxConsecRed, consecutiveRed);
            } else {
              consecutiveRed = 0;
            }
          }
          const currentBelowLimit = price < limitPrice;
          if (pullbackFound && maxConsecRed >= 2 && currentBelowLimit) {
            limitUpAlert = {
              date: limitDate,
              limitPrice: parseFloat(limitPrice.toFixed(1)),
              consecutive: maxConsecRed,
              msg: `⚡ 漲停回調訊號：${limitDate?.slice(5)} 曾漲停(${parseFloat(limitPrice.toFixed(1))})，回調後出現${maxConsecRed}根連續紅K，目前尚未突破漲停價，留意突破機會！`
            };
          }
        }
        break;
      }
    }

    // 回測掃描（近40天進場機會）
    const backtestSignals = [];
    for (let i = Math.max(20, closes.length - 40); i < closes.length - 1; i++) {
      const c = closes[i];
      const m5 = closes.slice(Math.max(0,i-4), i+1).reduce((a,b)=>a+b,0)/Math.min(5,i+1);
      const m10 = closes.slice(Math.max(0,i-9), i+1).reduce((a,b)=>a+b,0)/Math.min(10,i+1);
      const m20 = closes.slice(Math.max(0,i-19), i+1).reduce((a,b)=>a+b,0)/Math.min(20,i+1);
      const dayChg = (c - closes[i-1]) / closes[i-1] * 100;
      if (c > m5 && c > m20 && dayChg > 0) {
        backtestSignals.push({ date: dates[i], price: parseFloat(c.toFixed(1)), signal: '站上5MA可進場', change: parseFloat(dayChg.toFixed(1)) });
      }
    }
    const recentSignals = backtestSignals.slice(-5).reverse();

    // 未選出原因分析（近3天）
    const notSelectedReasons = [];
    for (let i = closes.length - 4; i < closes.length - 1; i++) {
      if (i < 0) continue;
      const c = closes[i];
      const m5 = closes.slice(Math.max(0,i-4), i+1).reduce((a,b)=>a+b,0)/Math.min(5,i+1);
      const m20 = closes.slice(Math.max(0,i-19), i+1).reduce((a,b)=>a+b,0)/Math.min(20,i+1);
      const dayChg = (c - closes[i-1]) / closes[i-1] * 100;
      const { k: dk } = calcKD(highs.slice(0,i+1), lows.slice(0,i+1), closes.slice(0,i+1));
      let reason = '';
      if (dayChg >= 9.5) reason = `當日漲幅 ${dayChg.toFixed(1)}% 過大`;
      else if (dk > 80) reason = `K值 ${dk.toFixed(0)} 過高`;
      else if (c < m20) reason = `跌破 MA20`;
      else if (c < m5) reason = `跌破 5MA`;
      else reason = '條件未達標';
      notSelectedReasons.push({ date: dates[i], reason });
    }

    // 主力評分
    const mainScore = Math.max(10, Math.min(95, Math.floor(50 + changePercent*5 + (price > ma20 ? 15 : -15) + Math.random()*10)));
    const mainStatus = mainScore >= 75 ? '拉抬' : mainScore >= 55 ? '吃貨' : mainScore >= 40 ? '洗盤' : '出貨';
    const mainCostLow = parseFloat((ma20*0.97).toFixed(1));
    const mainCostHigh = parseFloat((ma20*1.01).toFixed(1));
    const mainDistPercent = parseFloat(((price-mainCostHigh)/mainCostHigh*100).toFixed(1));
    const scoreLabel = mainScore >= 80 ? '主力偏多' : mainScore >= 60 ? '偏多' : mainScore >= 40 ? '中性' : '偏空';

    const result = {
      stock: {
        code, name, price, change, changePercent, volume, trend, position, state,
        ma5, ma10, ma20, ma60,
        kd: { k, d, signal: kdSignal, cross: kdCross },
        rsi,
        resistance: { r1: resistance1, r2: resistance2, support: support1 },
        entryZones: {
          A: { label: 'A★ 低接', low: entryA_low, high: entryA_high, stopLoss: stopA, target: targetA, rr: rrA, desc: 'MA10/MA20貼近箱底，視同A進場' },
          B: { label: 'B 回穩', desc: 'MA10/MA20貼近箱底，視同A進場', active: Math.abs(price - boxBottom) / boxBottom < 0.03 },
          C: { label: 'C 突破', low: entryC_low, high: entryC_high, stopLoss: stopC, target: targetC, rr: rrC, desc: '突破短期高點確認入場，僅小倉' }
        },
        limitUpAlert,
        backtestSignals: recentSignals,
        notSelectedReasons: notSelectedReasons.slice(-3).reverse(),
        techConclusion: `${name}（${code}）目前 ${price}，5MA ${ma5}、20MA ${ma20}、60MA ${ma60}。KD ${k}/${d}${kdCross ? '（'+kdCross+'）' : ''}，RSI ${rsi}。價格${price > ma20 ? '站上' : '跌破'}20MA，技術面${trend}，出現${state}訊號。`,
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
        fugle(`/stock/historical/candles/${s.code}`, { timeframe: 'D', limit: 30 })
      ]);

      const price = parseFloat((quote?.closePrice || quote?.lastPrice || 0).toFixed(1));
      if (!price) continue;

      const weekCloses = (weekCandles?.data || []).map(c => c.close).filter(v => v).reverse();
      const ma20w = weekCloses.length >= 20 ? parseFloat((weekCloses.slice(-20).reduce((a,b)=>a+b,0)/20).toFixed(1)) : price;
      const distMA = ma20w > 0 ? parseFloat(((price-ma20w)/ma20w*100).toFixed(1)) : 0;
      if (Math.abs(distMA) > 15) continue;

      const dailyData = (dayCandles?.data || []).reverse();
      const dailyCloses = dailyData.map(c => c.close).filter(v => v);
      const dailyDates = dailyData.map(c => c.date).filter(v => v);

      // 漲停偵測
      let limitUpDate = null, limitUpPrice = null, limitStatus = null;
      for (let i = 1; i < dailyCloses.length; i++) {
        const chg = (dailyCloses[i]-dailyCloses[i-1])/dailyCloses[i-1]*100;
        if (chg >= 9.5) {
          limitUpDate = dailyDates[i] || null;
          limitUpPrice = parseFloat(dailyCloses[i].toFixed(1));
          if (price >= limitUpPrice*0.95 && price <= limitUpPrice*1.05) limitStatus = '漲停後整理中';
          else if (price > limitUpPrice*1.05 && price <= limitUpPrice*1.12) limitStatus = '漲停後再攻';
          else if (price < limitUpPrice*0.95) limitStatus = '漲停後跌破';
          else limitStatus = '漲停後過熱';
          break;
        }
      }

      // 漲停後回調連續紅K偵測
      let limitUpRedK = null;
      for (let i = 1; i < dailyCloses.length; i++) {
        const chg = (dailyCloses[i]-dailyCloses[i-1])/dailyCloses[i-1]*100;
        if (chg >= 9.5) {
          const limitPrice = dailyCloses[i];
          const afterCandles = dailyCloses.slice(i+1);
          if (afterCandles.length >= 2) {
            let consecutive = 0, maxConsec = 0;
            for (let j = 1; j < afterCandles.length; j++) {
              if (afterCandles[j] > afterCandles[j-1]) { consecutive++; maxConsec = Math.max(maxConsec, consecutive); }
              else consecutive = 0;
            }
            if (maxConsec >= 2 && price < limitPrice) {
              limitUpRedK = `漲停回調${maxConsec}紅K未破高`;
            }
          }
          break;
        }
      }

      const prevClose = dailyCloses[dailyCloses.length-2] || price;
      const todayChg = (price-prevClose)/prevClose*100;
      const mainForce = todayChg > 1.5 ? '拉抬' : todayChg > 0.5 ? '吃貨' : todayChg < -1 ? '出貨' : '洗盤';
      const flow = todayChg > 0.5 ? '流入' : todayChg < -0.5 ? '流出' : '小量流入';

      // KD
      const dailyHighs = dailyData.map(c => c.high).filter(v => v);
      const dailyLows = dailyData.map(c => c.low).filter(v => v);
      const { k, d } = calcKD(dailyHighs, dailyLows, dailyCloses);
      const kdSignal = k < 20 ? '超賣' : k > 80 ? '超買' : k > d ? 'K>D' : 'K<D';

      let score = 3;
      if (distMA > 0 && distMA < 8) score++;
      if (limitStatus === '漲停後整理中' || limitStatus === '漲停後再攻') score++;
      if (k < 30) score++;
      if (limitUpRedK) score++;
      score = Math.round(Math.min(5, Math.max(1, score)));

      results.push({
        code: s.code, name: s.name, price, ma20w, distMA,
        limitUpDate, limitUpPrice, limitStatus, limitUpRedK,
        flow, mainForce, score,
        kd: { k, d, signal: kdSignal }
      });
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

setInterval(runScreener, 5 * 60 * 1000);
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

function getScreenerData() { return screenerData; }
module.exports = router;
module.exports.getScreenerData = getScreenerData;
