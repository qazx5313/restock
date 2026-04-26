const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 會員表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(50) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(10) DEFAULT 'user',
        status VARCHAR(10) DEFAULT 'pending',
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 每日報告表
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        report_date DATE NOT NULL,
        market_trend VARCHAR(20),
        summary TEXT,
        content JSONB DEFAULT '{}',
        status VARCHAR(10) DEFAULT 'draft',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 技術參數表
    await client.query(`
      CREATE TABLE IF NOT EXISTS tech_params (
        id SERIAL PRIMARY KEY,
        param_key VARCHAR(50) UNIQUE NOT NULL,
        param_value VARCHAR(50) NOT NULL,
        param_default VARCHAR(50) NOT NULL,
        description VARCHAR(100),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 操作日誌
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id),
        action VARCHAR(50),
        target_user_id INTEGER,
        detail TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 初始化技術參數
    const defaultParams = [
      ['ma1', '5', '5', 'MA1均線週期'],
      ['ma2', '10', '10', 'MA2均線週期'],
      ['ma3', '20', '20', 'MA3均線週期'],
      ['ma4', '60', '60', 'MA4均線週期'],
      ['rsi_period', '14', '14', 'RSI週期'],
      ['rsi_overbought', '70', '70', 'RSI超買'],
      ['rsi_oversold', '30', '30', 'RSI超賣'],
      ['macd_fast', '12', '12', 'MACD快線'],
      ['macd_slow', '26', '26', 'MACD慢線'],
      ['macd_signal', '9', '9', 'MACD訊號線'],
      ['kd_k', '9', '9', 'KD K週期'],
      ['kd_d', '3', '3', 'KD D週期'],
      ['kd_smooth', '3', '3', 'KD平滑值'],
      ['bb_period', '20', '20', '布林通道週期'],
      ['bb_std', '2', '2', '布林通道標準差'],
      ['volume_multiplier', '1.5', '1.5', '放量倍數'],
      ['limit_up_threshold', '9.5', '9.5', '漲停判定門檻(%)'],
      ['candle_period', 'day', 'day', 'K線週期'],
      ['lookback_days', '60', '60', '回測天數'],
    ];

    for (const [key, val, def, desc] of defaultParams) {
      await client.query(`
        INSERT INTO tech_params (param_key, param_value, param_default, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (param_key) DO NOTHING
      `, [key, val, def, desc]);
    }

    // 初始化管理員帳號
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin@2024!';
    const existing = await client.query('SELECT id FROM users WHERE username = $1', [adminUser]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPass, 10);
      await client.query(`
        INSERT INTO users (nickname, username, password_hash, role, status, expires_at)
        VALUES ($1, $2, $3, 'admin', 'active', '2099-12-31')
      `, ['系統管理員', adminUser, hash]);
      console.log(`✅ 管理員帳號已建立: ${adminUser}`);
    }

    await client.query('COMMIT');
    console.log('✅ 資料庫初始化完成');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ 資料庫初始化失敗:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
