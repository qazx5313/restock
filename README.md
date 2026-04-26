# 📊 TW STOCK PRO — 台股決策系統

> 主力・技術・資金 整合決策系統

---

## 🚀 Railway 部署流程（完整步驟）

### 步驟 1：Fork / Push 到 GitHub

```bash
git init
git add .
git commit -m "init: 台股決策系統初始化"
git branch -M main
git remote add origin https://github.com/你的帳號/twstock-pro.git
git push -u origin main
```

---

### 步驟 2：在 Railway 建立專案

1. 前往 [railway.app](https://railway.app) 並登入
2. 點選 **「New Project」**
3. 選擇 **「Deploy from GitHub repo」**
4. 選擇你的 `twstock-pro` 儲存庫
5. Railway 會自動偵測並開始部署

---

### 步驟 3：新增 PostgreSQL 資料庫

1. 在 Railway 專案中點選 **「+ Add Service」**
2. 選擇 **「Database → PostgreSQL」**
3. 資料庫建立後，點選 PostgreSQL 服務
4. 進入 **「Variables」** 頁籤
5. 複製 **`DATABASE_URL`** 的值

---

### 步驟 4：設定環境變數

在 Railway 的 **Web Service → Variables** 中加入：

| 變數名稱 | 說明 | 範例值 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 連線字串 | 從 Railway 複製 |
| `JWT_SECRET` | JWT 簽名密鑰（請使用強密碼） | `MyS3cur3K3y!@#$%` |
| `ADMIN_USERNAME` | 管理員帳號 | `admin` |
| `ADMIN_PASSWORD` | 管理員密碼 | `Admin@2024!` |
| `NODE_ENV` | 環境設定 | `production` |

> ⚠️ **重要：** `JWT_SECRET` 請使用至少32字元的隨機字串

---

### 步驟 5：確認部署

1. Railway 會自動重新部署
2. 部署完成後點選右上角的 **「Generate Domain」**
3. 取得你的 Railway 網址：`https://xxx.railway.app`

---

### 步驟 6：首次登入

使用你在環境變數設定的管理員帳號密碼登入。

**預設（如未設定環境變數）：**
- 帳號：`admin`
- 密碼：`Admin@2024!`

---

## 🔄 自動重新部署

每次 `git push` 到 `main` 分支，Railway 會**自動重新部署**。

```bash
# 修改程式碼後
git add .
git commit -m "feat: 新增功能"
git push
# Railway 自動重部署，約 1-3 分鐘
```

---

## 📁 專案結構

```
twstock-pro/
├── server/
│   ├── index.js          # Express 主伺服器
│   ├── db/
│   │   └── index.js      # 資料庫連線與初始化
│   ├── middleware/
│   │   └── auth.js       # JWT 認證中介軟體
│   └── routes/
│       ├── auth.js       # 登入/註冊 API
│       ├── admin.js      # 管理員 API
│       └── api.js        # 使用者功能 API
├── public/
│   ├── index.html        # 前端主頁面（SPA）
│   ├── css/
│   │   └── main.css      # 主樣式
│   └── js/
│       └── app.js        # 前端邏輯
├── package.json
├── railway.toml          # Railway 設定
├── .env.example          # 環境變數範本
└── .gitignore
```

---

## 🔧 本地開發

```bash
# 安裝套件
npm install

# 複製環境變數
cp .env.example .env
# 編輯 .env 填入本地 PostgreSQL 連線資訊

# 啟動開發伺服器
npm run dev
# 開啟 http://localhost:3000
```

---

## 📊 系統功能

| 功能模組 | 說明 |
|---|---|
| 🔐 會員系統 | 註冊/登入/狀態管理（pending/active/expired/disabled） |
| 👤 管理後台 | 會員開通、技術參數調整、報告管理 |
| 📡 大盤雷達 | 加權指數、台指期、散戶多空、族群資金流向 |
| 🔍 股票篩選 | 突破20MA、漲停後整理偵測、多維評分 |
| 📈 個股分析 | 技術分析+主力行為判讀+操作劇本 |
| 📋 每日報告 | 管理員發布、使用者查閱 |
| ⚙️ 技術參數 | MA/RSI/MACD/KD/BB 全站動態調整 |

---

## 🛡️ 安全性

- 密碼使用 **bcrypt** 加密
- API 使用 **JWT** 認證
- 已設定 **Rate Limiting** 防暴力攻擊
- 使用 **Helmet** 增強 HTTP 安全標頭
- 管理員路由有獨立權限驗證

---

## 📝 API 文件

### 認證
- `POST /api/auth/register` — 註冊
- `POST /api/auth/login` — 登入
- `GET /api/auth/me` — 取得目前使用者

### 使用者（需 active）
- `GET /api/market/overview` — 大盤數據
- `GET /api/screener` — 股票篩選
- `GET /api/stock/:code` — 個股分析
- `GET /api/reports` — 已發布報告

### 管理員
- `GET /api/admin/users` — 會員列表
- `POST /api/admin/users/:id/activate` — 開通
- `GET/PUT /api/admin/params` — 技術參數
- `POST/PUT/DELETE /api/admin/reports` — 報告管理
