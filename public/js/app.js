/* ============================================================
   TW STOCK PRO - 前端應用程式
   ============================================================ */



// ===== 全域狀態 =====
const App = {
  token: localStorage.getItem('twstock_token'),
  user: null,
  currentPage: 'home',
  params: {},
};

// ===== API 請求工具 =====
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (App.token) opts.headers['Authorization'] = `Bearer ${App.token}`;
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`/api${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `請求失敗 (${res.status})`);
    return data;
  } catch (err) {
    throw err;
  }
}

// ===== Toast 通知 =====
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ===== 頁面切換 =====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const page = document.getElementById(`page-${pageId}`);
  if (page) {
        page.style.display = pageId === 'auth' ? 'flex' : 'block';
    page.classList.add('active');
  }
}


function switchSection(name) {
  App.currentPage = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById(`section-${name}`);
  if (sec) sec.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });
  document.querySelectorAll('.bnav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });

  // 載入頁面數據
  if (name === 'home') loadMarketOverview();
  if (name === 'screener') loadScreener();
  if (name === 'reports') loadReports();
  if (name === 'admin') loadAdminMembers();

  window.scrollTo(0, 0);
}

// ===== 認證 =====
function setupAuth() {
  // Tab 切換
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`form-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // 登入
  document.getElementById('btn-login').addEventListener('click', async () => {
    const btn = document.getElementById('btn-login');
    const errEl = document.getElementById('login-error');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    errEl.textContent = '';
    if (!username || !password) { errEl.textContent = '請輸入帳號密碼'; return; }

    btn.textContent = '登入中...'; btn.disabled = true;
    try {
      const data = await api('POST', '/auth/login', { username, password });
      App.token = data.token;
      App.user = data.user;
      localStorage.setItem('twstock_token', data.token);
      initMainApp();
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.textContent = '登入系統'; btn.disabled = false;
    }
  });

  // Enter 鍵登入
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });

  // 註冊
  document.getElementById('btn-register').addEventListener('click', async () => {
    const btn = document.getElementById('btn-register');
    const errEl = document.getElementById('reg-error');
    const sucEl = document.getElementById('reg-success');
    const nickname = document.getElementById('reg-nickname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;

    errEl.textContent = ''; sucEl.textContent = '';
    if (!nickname || !username || !password) { errEl.textContent = '請填寫所有欄位'; return; }

    btn.textContent = '註冊中...'; btn.disabled = true;
    try {
      await api('POST', '/auth/register', { nickname, username, password });
      sucEl.textContent = '✓ 註冊成功！請等待管理員審核開通。';
      document.getElementById('reg-nickname').value = '';
      document.getElementById('reg-username').value = '';
      document.getElementById('reg-password').value = '';
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.textContent = '立即註冊'; btn.disabled = false;
    }
  });
}

// ===== 初始化主系統 =====
function initMainApp() {
  const user = App.user;
  if (!user) return;

  if (user.status === 'pending' || user.status === 'expired') {
    document.getElementById('pending-status').textContent =
      user.status === 'expired' ? '您的使用期限已到期，請聯繫管理員續約。' : '帳號建立成功，等待管理員開通中。';
    document.getElementById('btn-pending-logout').onclick = logout;
    document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
document.getElementById('page-pending').style.display = 'flex';

    return;
  }

  if (user.status === 'disabled') {
    showPage('auth');
    return;
  }

  // 顯示主系統
  showPage('main');
  document.getElementById('nav-username').textContent = user.nickname;

  // 管理員入口
  if (user.role === 'admin') {
    document.getElementById('bnav-admin').style.display = '';
    document.getElementById('qe-admin').style.display = '';
  }

  // 導航綁定
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.page));
  });

  // 登出
  document.getElementById('btn-logout').addEventListener('click', logout);

  // 載入首頁
  switchSection('home');
  loadParams();
}

function logout() {
  App.token = null;
  App.user = null;
  localStorage.removeItem('twstock_token');
  showPage('auth');
}

// ===== 首頁：大盤雷達 =====
async function loadMarketOverview() {
  try {
    const data = await api('GET', '/market/overview');

    // 加權指數
    const wVal = document.getElementById('weighted-value');
    const wChg = document.getElementById('weighted-change');
    wVal.textContent = data.weighted_index.value.toLocaleString();
    const wSign = data.weighted_index.change >= 0 ? '+' : '';
    wChg.innerHTML = `<span class="${data.weighted_index.change >= 0 ? 'up' : 'down'}">${wSign}${data.weighted_index.change} (${wSign}${data.weighted_index.changePercent}%)</span>`;

    // 台指期
    const fVal = document.getElementById('futures-value');
    const fChg = document.getElementById('futures-change');
    fVal.textContent = data.futures.value.toLocaleString();
    const fSign = data.futures.change >= 0 ? '+' : '';
    fChg.innerHTML = `<span class="${data.futures.change >= 0 ? 'up' : 'down'}">${fSign}${data.futures.change}</span>`;

    // 正逆價差
    const premSign = data.premium >= 0 ? '+' : '';
    document.getElementById('premium-value').innerHTML =
      `<span class="${data.premium >= 0 ? 'up' : 'down'}">${premSign}${data.premium}</span>`;

    // 盤勢
    const trendMap = { bullish: ['多頭 ▲', 'trend-bullish'], bearish: ['空頭 ▼', 'trend-bearish'], sideways: ['震盪 ↔', 'trend-sideways'] };
    const [trendText, trendClass] = trendMap[data.market_trend] || ['---', ''];
    const trendEl = document.getElementById('market-trend');
    trendEl.textContent = trendText;
    trendEl.className = `card-value-lg trend-badge ${trendClass}`;

    // 資金狀態
    const isOpen = data.isMarketOpen;
    const statusBadge = document.getElementById('market-status-badge');
    statusBadge.textContent = isOpen ? '盤中' : '已收盤';
    statusBadge.className = `status-badge ${isOpen ? 'badge-open' : 'badge-closed'}`;
    document.getElementById('flow-status').innerHTML = `<span class="up">↑ 主流入</span>`;

    // 散戶多空
    const diff = data.retail_long - data.retail_short;
    document.getElementById('retail-long').textContent = data.retail_long.toLocaleString();
    document.getElementById('retail-short').textContent = data.retail_short.toLocaleString();
    document.getElementById('retail-diff').innerHTML =
      `<span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff.toLocaleString()}</span>`;

    const longRatio = (data.retail_long / (data.retail_long + data.retail_short) * 100).toFixed(1);
    document.getElementById('retail-bar').style.width = `${longRatio}%`;

    const judgeEl = document.getElementById('retail-judge');
    if (diff > 5000) { judgeEl.textContent = '散戶偏多 — 多單持倉積極'; judgeEl.style.color = 'var(--up)'; }
    else if (diff < -5000) { judgeEl.textContent = '散戶偏空 — 空單持倉積極'; judgeEl.style.color = 'var(--down)'; }
    else { judgeEl.textContent = '散戶多空均衡 — 方向不明確'; judgeEl.style.color = 'var(--neutral)'; }

    // 族群
    const sectorsEl = document.getElementById('sectors-list');
    sectorsEl.innerHTML = data.sectors.map(s => `
      <div class="sector-row" onclick="showSectorStocks('${s.name}', ${JSON.stringify(s.stocks).replace(/'/g, '&apos;')})">
        <div class="sector-name">${s.name}</div>
        <div class="sector-flow ${s.flow >= 0 ? 'up' : 'down'}">
          ${s.flow >= 0 ? '+' : ''}${s.flow}億
        </div>
        <div class="sector-change ${s.change >= 0 ? 'up' : 'down'}">
          ${s.change >= 0 ? '+' : ''}${s.change}%
        </div>
        <div style="color:var(--neutral);margin-left:8px;">›</div>
      </div>
    `).join('');

  } catch (err) {
    toast('大盤數據載入失敗', 'error');
  }
}

function showSectorStocks(name, stocks) {
  const content = `
    <h3>📊 ${name} 族群個股</h3>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
      ${stocks.map(s => `
        <div class="sector-row" style="cursor:pointer" onclick="searchStock('${s}')">
          <div class="sector-name">${s}</div>
          <div style="color:var(--accent);font-size:13px;">查看分析 ›</div>
        </div>
      `).join('')}
    </div>
  `;
  showModal(content);
}

// ===== 股票篩選 =====
let screenerFilter = 'all';

async function loadScreener() {
  const listEl = document.getElementById('screener-list');
  listEl.innerHTML = '<div class="loading-spinner">篩選中...</div>';
  try {
    const data = await api('GET', '/screener');
    renderScreener(data.stocks);
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div>載入失敗</div></div>';
  }
}

function renderScreener(stocks) {
  const listEl = document.getElementById('screener-list');
  let filtered = stocks;

  if (screenerFilter === 'breakthrough') {
    filtered = stocks.filter(s => !s.limitUpDate);
  } else if (screenerFilter === 'limitup') {
    filtered = stocks.filter(s => s.limitUpDate);
  }

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div>目前無符合條件個股</div></div>';
    return;
  }

  listEl.innerHTML = filtered.map(s => {
    const stars = '★'.repeat(s.score) + '☆'.repeat(5 - s.score);
    const limitTag = s.limitStatus ? getLimitTag(s.limitStatus) : '';
    const mainTag = s.mainForce ? getMainTag(s.mainForce) : '';
    const flowTag = s.flow ? getFlowTag(s.flow) : '';
    const distSign = s.distMA >= 0 ? '+' : '';

    return `
      <div class="stock-card" onclick="searchStock('${s.code}')">
        <div class="stock-card-header">
          <div class="stock-code-name">
            <div class="stock-code">${s.code}</div>
            <div class="stock-name">${s.name}</div>
          </div>
          <div class="stock-price-wrap">
            <div class="stock-price">${s.price}</div>
            <div class="star-score" style="font-size:12px;">${stars}</div>
          </div>
        </div>
        <div class="stock-meta-grid">
          <div class="stock-meta-item">
            <div class="smi-label">周20MA</div>
            <div class="smi-value">${s.ma20w}</div>
          </div>
          <div class="stock-meta-item">
            <div class="smi-label">距離MA</div>
            <div class="smi-value ${s.distMA >= 0 ? 'up' : 'down'}">${distSign}${s.distMA}%</div>
          </div>
          <div class="stock-meta-item">
            <div class="smi-label">漲停日</div>
            <div class="smi-value">${s.limitUpDate ? s.limitUpDate.slice(5) : '--'}</div>
          </div>
        </div>
        <div class="stock-tags">
          ${limitTag}${mainTag}${flowTag}
          <span class="tag" style="background:rgba(11,60,93,0.06);color:var(--primary)">${s.score}星</span>
        </div>
      </div>
    `;
  }).join('');
}

function getLimitTag(status) {
  const map = {
    '漲停後整理中': 'tag-limit-con',
    '漲停後再攻': 'tag-limit-att',
    '漲停後跌破': 'tag-limit',
    '漲停後過熱': 'tag-limit-hot',
  };
  return `<span class="tag ${map[status] || ''}">${status}</span>`;
}

function getMainTag(force) {
  const map = { '吃貨': 'tag-main-buy', '洗盤': 'tag-main-buy', '拉抬': 'tag-main-buy', '出貨': 'tag-main-sell', '無主力': '' };
  return force ? `<span class="tag ${map[force] || ''}">${force}</span>` : '';
}

function getFlowTag(flow) {
  const isIn = flow.includes('流入');
  return `<span class="tag ${isIn ? 'tag-flow-in' : 'tag-flow-out'}">${flow}</span>`;
}

// 篩選 Tab
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    screenerFilter = tab.dataset.filter;
    loadScreener();
  });
});

document.getElementById('btn-refresh-screener').addEventListener('click', loadScreener);

// ===== 個股分析 =====
async function searchStock(code) {
  if (!code) return;
  const input = document.getElementById('stock-code-input');
  input.value = code;
  switchSection('stock');

  const resultEl = document.getElementById('stock-result');
  resultEl.innerHTML = '<div class="loading-spinner">分析中...</div>';

  try {
    const data = await api('GET', `/stock/${code}`);
    renderStockAnalysis(data.stock);
  } catch (err) {
    resultEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div>${err.message}</div></div>`;
  }
}

function renderStockAnalysis(s) {
  const resultEl = document.getElementById('stock-result');
  const changeSign = s.change >= 0 ? '+' : '';
  const trendBadge = `sth-badge ${s.trend === '多頭' ? 'bullish' : s.trend === '空頭' ? 'bearish' : 'sideways'}`;

  const scoreColor = s.mainScore >= 80 ? 'score-80' : s.mainScore >= 60 ? 'score-60' : s.mainScore >= 40 ? 'score-40' : 'score-20';
  const scoreLabel = s.mainScore >= 80 ? '主力偏多' : s.mainScore >= 60 ? '偏多' : s.mainScore >= 40 ? '中性' : '偏空';

  resultEl.innerHTML = `
    <div class="stock-header-band">
      <div class="sth-top">
        <div>
          <div class="sth-code">${s.code}</div>
          <div class="sth-name">${s.name}</div>
        </div>
        <div class="sth-price-area">
          <div class="sth-price">${s.price}</div>
          <div class="sth-change ${s.change >= 0 ? 'up' : 'down'}">${changeSign}${s.change} (${changeSign}${s.changePercent}%)</div>
        </div>
      </div>
      <div class="sth-badges">
        <span class="${trendBadge}">${s.trend}</span>
        <span class="sth-badge">位置：${s.position}</span>
        <span class="sth-badge">狀態：${s.state}</span>
        <span class="sth-badge">量：${s.volume?.toLocaleString()}張</span>
      </div>
    </div>

    <div class="analysis-section">
      <div class="analysis-title">技術分析結論</div>
      <p style="font-size:14px;line-height:1.8;color:var(--text)">${s.techConclusion}</p>
    </div>

    <div class="analysis-section">
      <div class="analysis-title">主力行為判讀</div>
      <div class="main-score-bar-wrap">
        <div class="main-score-label">
          <span>主力分數</span>
          <span class="${s.mainScore >= 60 ? 'up' : s.mainScore >= 40 ? 'warn' : 'down'}" style="font-family:'JetBrains Mono',monospace;font-weight:700;">${s.mainScore} / 100</span>
        </div>
        <div class="main-score-track">
          <div class="main-score-fill ${scoreColor}" style="width:${s.mainScore}%"></div>
        </div>
        <div style="font-size:12px;margin-top:4px;color:var(--text-sub)">判定：<strong>${scoreLabel}</strong></div>
      </div>
      <div class="main-status-grid">
        <div class="msi">
          <div class="msi-label">主力狀態</div>
          <div class="msi-value ${s.mainStatus === '出貨' ? 'down' : s.mainStatus === '無主力' ? 'neutral' : 'up'}">${s.mainStatus}</div>
        </div>
        <div class="msi">
          <div class="msi-label">距成本區</div>
          <div class="msi-value up">+${s.mainDistPercent}%</div>
        </div>
        <div class="msi">
          <div class="msi-label">成本低點</div>
          <div class="msi-value">${s.mainCostLow}</div>
        </div>
        <div class="msi">
          <div class="msi-label">成本高點</div>
          <div class="msi-value">${s.mainCostHigh}</div>
        </div>
      </div>
      <p style="font-size:13px;color:var(--text-sub);line-height:1.7">${s.mainConclusion}</p>
    </div>

    <div class="analysis-section">
      <div class="analysis-title">操作劇本</div>
      <div class="play-book">
        <div class="play-book-header">▲ 多單策略</div>
        <div class="play-book-body">
          <div class="play-row"><span class="play-row-label">進場條件</span><span class="play-row-value">${s.longPlay?.entry}</span></div>
          <div class="play-row"><span class="play-row-label">停損設定</span><span class="play-row-value down">${s.longPlay?.stopLoss}</span></div>
          <div class="play-row"><span class="play-row-label">目標價位</span><span class="play-row-value up">${s.longPlay?.target}</span></div>
          <div class="play-row"><span class="play-row-label">風報比</span><span class="play-row-value">${s.longPlay?.rr}</span></div>
        </div>
      </div>
      <div class="play-book">
        <div class="play-book-header" style="background:var(--down)">▼ 空單策略</div>
        <div class="play-book-body">
          <div class="play-row"><span class="play-row-label">進場條件</span><span class="play-row-value">${s.shortPlay?.condition}</span></div>
          <div class="play-row"><span class="play-row-label">操作策略</span><span class="play-row-value">${s.shortPlay?.strategy}</span></div>
        </div>
      </div>
    </div>

    <div class="final-conclusion">
      <strong>✦ 最終結論</strong>
      ${s.finalConclusion}
    </div>
  `;
}

document.getElementById('btn-search-stock').addEventListener('click', () => {
  const code = document.getElementById('stock-code-input').value.trim();
  if (code) searchStock(code);
});

document.getElementById('stock-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-search-stock').click();
});

// ===== 每日報告 =====
async function loadReports() {
  const listEl = document.getElementById('reports-list');
  listEl.innerHTML = '<div class="loading-spinner">載入中...</div>';
  try {
    const data = await api('GET', '/reports');
    if (data.reports.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div>目前尚無已發布報告</div></div>';
      return;
    }
    const trendMap = { bullish: '多頭', bearish: '空頭', sideways: '震盪' };
    listEl.innerHTML = data.reports.map(r => `
      <div class="report-card" onclick="showReportDetail(${r.id})">
        <div class="report-card-header">
          <div>
            <div class="report-title">${r.title}</div>
            <div class="report-date" style="margin-top:3px">${r.report_date} · ${r.author_name || '管理員'}</div>
          </div>
          <span class="trend-pill ${r.market_trend}">${trendMap[r.market_trend] || r.market_trend || '--'}</span>
        </div>
        ${r.summary ? `<div class="report-summary">${r.summary.slice(0, 100)}${r.summary.length > 100 ? '...' : ''}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div>載入失敗</div></div>';
  }
}

async function showReportDetail(id) {
  try {
    const data = await api('GET', `/reports/${id}`);
    const r = data.report;
    const trendMap = { bullish: '多頭 ▲', bearish: '空頭 ▼', sideways: '震盪 ↔' };
    const trendCls = { bullish: 'up', bearish: 'down', sideways: 'warn' };
    showModal(`
      <div style="padding-top:8px">
        <div style="font-size:11px;color:var(--text-sub);margin-bottom:6px;font-family:'JetBrains Mono',monospace">${r.report_date}</div>
        <h2 style="font-size:18px;font-weight:700;color:var(--primary);margin-bottom:12px">${r.title}</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <span style="font-size:12px;color:var(--text-sub)">盤勢判斷：</span>
          <span class="${trendCls[r.market_trend] || ''}" style="font-size:14px;font-weight:700">${trendMap[r.market_trend] || '--'}</span>
        </div>
        ${r.summary ? `
          <div style="background:var(--card-bg);border-radius:8px;padding:14px;margin-bottom:16px;border:1px solid var(--border)">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-sub);margin-bottom:8px">核心摘要</div>
            <div style="font-size:13px;line-height:1.8;color:var(--text)">${r.summary}</div>
          </div>
        ` : ''}
        <div style="font-size:12px;color:var(--text-sub);text-align:right">by ${r.author_name || '管理員'}</div>
      </div>
    `);
  } catch (err) {
    toast('載入報告失敗', 'error');
  }
}

// ===== Modal =====
function showModal(content) {
  document.getElementById('modal-content').innerHTML = content;
  document.getElementById('stock-modal').style.display = 'flex';
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('stock-modal').style.display = 'none';
});

document.getElementById('stock-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('stock-modal')) {
    document.getElementById('stock-modal').style.display = 'none';
  }
});

// ===== 管理後台 =====

// Admin Tab 切換
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`admin-${tab.dataset.adminTab}`).classList.add('active');

    if (tab.dataset.adminTab === 'members') loadAdminMembers();
    if (tab.dataset.adminTab === 'reports') loadAdminReports();
    if (tab.dataset.adminTab === 'params') loadAdminParams();
  });
});

// ===== 會員管理 =====
let activateUserId = null;
let selectedDays = null;

async function loadAdminMembers() {
  const wrapEl = document.getElementById('members-table-wrap');
  const search = document.getElementById('member-search')?.value || '';
  const sort = document.getElementById('member-sort')?.value || 'created_at';
  wrapEl.innerHTML = '<div class="loading-spinner">載入中...</div>';

  try {
    const params = new URLSearchParams({ search, sort, limit: 50 });
    const data = await api('GET', `/admin/users?${params}`);
    renderMembersTable(data.users);
  } catch (err) {
    wrapEl.innerHTML = `<div class="empty-state"><div>載入失敗</div></div>`;
  }
}

function renderMembersTable(users) {
  const wrapEl = document.getElementById('members-table-wrap');
  if (users.length === 0) {
    wrapEl.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><div>尚無會員</div></div>';
    return;
  }

  const now = new Date();
  const soon = new Date(); soon.setDate(soon.getDate() + 7);

  wrapEl.innerHTML = `
    <div class="table-scroll-wrap">
      <table class="members-table">
        <thead>
          <tr>
            <th>帳號</th>
            <th>暱稱</th>
            <th>狀態</th>
            <th>到期日</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => {
            const exp = u.expires_at ? new Date(u.expires_at) : null;
            const expStr = exp ? exp.toLocaleDateString('zh-TW') : '--';
            const expClass = exp && exp < soon && u.status === 'active' ? 'expire-soon' : '';
            const statusClass = `status-${u.status}`;
            const statusLabel = { active: '使用中', pending: '待開通', expired: '已過期', disabled: '已停用' }[u.status] || u.status;
            return `
              <tr>
                <td style="font-family:'JetBrains Mono',monospace;font-size:12px">${u.username}</td>
                <td>${u.nickname}</td>
                <td><span class="member-status-badge ${statusClass}">${statusLabel}</span></td>
                <td class="${expClass}" style="font-size:12px;font-family:'JetBrains Mono',monospace">${expStr}</td>
                <td>
                  <div class="member-actions">
                    <button class="action-btn action-activate" onclick="openActivateModal(${u.id},'${u.nickname}')">開通</button>
                    ${u.status !== 'pending' ? `<button class="action-btn action-revoke" onclick="revokeUser(${u.id})">取消</button>` : ''}
                    ${u.status !== 'disabled' ? `<button class="action-btn action-disable" onclick="disableUser(${u.id})">停用</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 搜尋與排序
let searchTimeout;
document.getElementById('member-search')?.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadAdminMembers, 400);
});
document.getElementById('member-sort')?.addEventListener('change', loadAdminMembers);

// 開通 Modal
function openActivateModal(userId, nickname) {
  activateUserId = userId;
  selectedDays = null;
  document.getElementById('activate-target-name').textContent = `開通對象：${nickname}`;
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('custom-days').value = '';
  document.getElementById('activate-modal').style.display = 'flex';
}

document.querySelectorAll('.day-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedDays = parseInt(btn.dataset.days);
    document.getElementById('custom-days').value = '';
  });
});

document.getElementById('btn-confirm-activate').addEventListener('click', async () => {
  const customDays = parseInt(document.getElementById('custom-days').value);
  const days = customDays || selectedDays;
  if (!days || days < 1) { toast('請選擇或輸入天數', 'warn'); return; }

  try {
    const data = await api('POST', `/admin/users/${activateUserId}/activate`, { days });
    toast(data.message, 'success');
    document.getElementById('activate-modal').style.display = 'none';
    loadAdminMembers();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('btn-cancel-activate').addEventListener('click', () => {
  document.getElementById('activate-modal').style.display = 'none';
});

async function revokeUser(id) {
  if (!confirm('確定要取消此帳號權限？')) return;
  try {
    const data = await api('POST', `/admin/users/${id}/revoke`);
    toast(data.message);
    loadAdminMembers();
  } catch (err) { toast(err.message, 'error'); }
}

async function disableUser(id) {
  if (!confirm('確定要停用此帳號？')) return;
  try {
    const data = await api('POST', `/admin/users/${id}/disable`);
    toast(data.message);
    loadAdminMembers();
  } catch (err) { toast(err.message, 'error'); }
}

// ===== 報告管理 =====
async function loadAdminReports() {
  const listEl = document.getElementById('admin-reports-list');
  listEl.innerHTML = '<div class="loading-spinner">載入中...</div>';
  document.getElementById('report-form-wrap').style.display = 'none';

  try {
    const data = await api('GET', '/admin/reports');
    const statusMap = { published: 'rs-published', draft: 'rs-draft', hidden: 'rs-hidden' };
    const statusLabel = { published: '已發布', draft: '草稿', hidden: '隱藏' };

    listEl.innerHTML = data.reports.length === 0
      ? '<div class="empty-state"><div>尚無報告</div></div>'
      : data.reports.map(r => `
        <div class="admin-report-item">
          <div class="ari-info">
            <div class="ari-title">${r.title}</div>
            <div class="ari-meta">${r.report_date} · ${r.author_name || '管理員'}</div>
          </div>
          <div class="ari-actions">
            <span class="report-status-badge ${statusMap[r.status]}">${statusLabel[r.status]}</span>
            <button class="action-btn action-activate" onclick="editReport(${r.id})">編輯</button>
            <button class="action-btn action-disable" onclick="deleteReport(${r.id})">刪除</button>
          </div>
        </div>
      `).join('');
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state"><div>載入失敗</div></div>';
  }
}

document.getElementById('btn-new-report').addEventListener('click', () => {
  document.getElementById('rf-id').value = '';
  document.getElementById('rf-title').value = '';
  document.getElementById('rf-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('rf-trend').value = 'bullish';
  document.getElementById('rf-summary').value = '';
  document.getElementById('rf-status').value = 'draft';
  document.getElementById('report-form-title').textContent = '新增報告';
  document.getElementById('report-form-wrap').style.display = 'block';
  document.getElementById('report-form-wrap').scrollIntoView({ behavior: 'smooth' });
});

async function editReport(id) {
  try {
    const data = await api('GET', '/admin/reports');
    const report = data.reports.find(r => r.id === id);
    if (!report) return;
    document.getElementById('rf-id').value = report.id;
    document.getElementById('rf-title').value = report.title;
    document.getElementById('rf-date').value = report.report_date;
    document.getElementById('rf-trend').value = report.market_trend || 'bullish';
    document.getElementById('rf-summary').value = report.summary || '';
    document.getElementById('rf-status').value = report.status;
    document.getElementById('report-form-title').textContent = '編輯報告';
    document.getElementById('report-form-wrap').style.display = 'block';
    document.getElementById('report-form-wrap').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { toast('載入失敗', 'error'); }
}

document.getElementById('btn-save-report').addEventListener('click', async () => {
  const id = document.getElementById('rf-id').value;
  const body = {
    title: document.getElementById('rf-title').value.trim(),
    report_date: document.getElementById('rf-date').value,
    market_trend: document.getElementById('rf-trend').value,
    summary: document.getElementById('rf-summary').value.trim(),
    status: document.getElementById('rf-status').value,
  };
  if (!body.title || !body.report_date) { toast('請填寫標題與日期', 'warn'); return; }

  try {
    if (id) {
      await api('PUT', `/admin/reports/${id}`, body);
      toast('報告已更新');
    } else {
      await api('POST', '/admin/reports', body);
      toast('報告已新增');
    }
    document.getElementById('report-form-wrap').style.display = 'none';
    loadAdminReports();
  } catch (err) { toast(err.message, 'error'); }
});

document.getElementById('btn-cancel-report').addEventListener('click', () => {
  document.getElementById('report-form-wrap').style.display = 'none';
});

async function deleteReport(id) {
  if (!confirm('確定要刪除此報告？')) return;
  try {
    await api('DELETE', `/admin/reports/${id}`);
    toast('已刪除');
    loadAdminReports();
  } catch (err) { toast(err.message, 'error'); }
}

// ===== 技術參數 =====
async function loadAdminParams() {
  const formEl = document.getElementById('params-form');
  formEl.innerHTML = '<div class="loading-spinner">載入中...</div>';
  try {
    const data = await api('GET', '/admin/params');
    renderParamsForm(data.params);
  } catch (err) {
    formEl.innerHTML = '<div class="empty-state"><div>載入失敗</div></div>';
  }
}

function renderParamsForm(params) {
  const groups = {
    '均線設定': ['ma1', 'ma2', 'ma3', 'ma4'],
    'RSI 參數': ['rsi_period', 'rsi_overbought', 'rsi_oversold'],
    'MACD 參數': ['macd_fast', 'macd_slow', 'macd_signal'],
    'KD 參數': ['kd_k', 'kd_d', 'kd_smooth'],
    '布林通道': ['bb_period', 'bb_std'],
    '成交量 & 漲停': ['volume_multiplier', 'limit_up_threshold'],
    'K線設定': ['lookback_days'],
  };

  const labelMap = {
    ma1: ['MA1 均線', '預設5'], ma2: ['MA2 均線', '預設10'],
    ma3: ['MA3 均線', '預設20'], ma4: ['MA4 均線', '預設60'],
    rsi_period: ['RSI 週期', '預設14'], rsi_overbought: ['RSI 超買', '預設70'],
    rsi_oversold: ['RSI 超賣', '預設30'],
    macd_fast: ['MACD 快線', '預設12'], macd_slow: ['MACD 慢線', '預設26'],
    macd_signal: ['MACD 訊號線', '預設9'],
    kd_k: ['KD K 週期', '預設9'], kd_d: ['KD D 週期', '預設3'],
    kd_smooth: ['KD 平滑值', '預設3'],
    bb_period: ['布林週期', '預設20'], bb_std: ['布林標準差', '預設2'],
    volume_multiplier: ['放量倍數', '預設1.5'],
    limit_up_threshold: ['漲停門檻 (%)', '預設9.5'],
    lookback_days: ['回測天數', '預設60'],
  };

  const paramsMap = {};
  params.forEach(p => paramsMap[p.param_key] = p);

  const formEl = document.getElementById('params-form');
  formEl.innerHTML = Object.entries(groups).map(([groupName, keys]) => `
    <div class="param-group-title">${groupName}</div>
    ${keys.map(key => {
      const p = paramsMap[key];
      if (!p) return '';
      const [label, hint] = labelMap[key] || [key, ''];
      return `
        <div class="param-row">
          <div class="param-label">${label}<span>${hint}</span></div>
          <input type="text" data-key="${key}" value="${p.param_value}" />
        </div>
      `;
    }).join('')}
  `).join('');
}

document.getElementById('btn-save-params').addEventListener('click', async () => {
  const inputs = document.querySelectorAll('#params-form input[data-key]');
  const params = {};
  inputs.forEach(input => { params[input.dataset.key] = input.value; });
  try {
    await api('PUT', '/admin/params', { params });
    toast('參數已儲存並全站套用');
    loadParams();
  } catch (err) { toast(err.message, 'error'); }
});

document.getElementById('btn-reset-params').addEventListener('click', async () => {
  if (!confirm('確定要重置所有技術參數為預設值？')) return;
  try {
    await api('POST', '/admin/params/reset');
    toast('已重置為預設值');
    loadAdminParams();
    loadParams();
  } catch (err) { toast(err.message, 'error'); }
});

// 載入全站技術參數
async function loadParams() {
  try {
    const data = await api('GET', '/params');
    App.params = data.params;
  } catch (err) { /* silent */ }
}

// ===== 初始化 =====
function init() {
  setupAuth();
  if (App.token) {
    // 嘗試自動登入
    api('GET', '/auth/me').then(data => {
      App.user = data.user;
      initMainApp();
    }).catch(() => {
      App.token = null;
      localStorage.removeItem('twstock_token');
      showPage('auth');
    });
  } else {
    showPage('auth');
  }
}

init();

window.openActivateModal = openActivateModal;
window.revokeUser = revokeUser;
window.disableUser = disableUser;
window.searchStock = searchStock;
window.showSectorStocks = showSectorStocks;
window.showReportDetail = showReportDetail;
window.editReport = editReport;
window.deleteReport = deleteReport;

