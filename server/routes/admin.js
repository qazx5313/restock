const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


const router = express.Router();
router.use(authMiddleware, requireAdmin);

// 取得會員列表
router.get('/users', async (req, res) => {
  try {
    const { search, sort = 'created_at', order = 'desc', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE role != 'admin'";
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (username ILIKE $${params.length} OR nickname ILIKE $${params.length})`;
    }

    const validSort = ['created_at', 'expires_at', 'username', 'status'];
    const sortCol = validSort.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    // 自動更新過期狀態
    await pool.query(`
      UPDATE users SET status='expired'
      WHERE status='active' AND expires_at IS NOT NULL AND expires_at < NOW()
    `);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      params
    );

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, nickname, username, role, status, expires_at, created_at
       FROM users ${whereClause}
       ORDER BY ${sortCol} ${sortOrder}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 開通會員
router.post('/users/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    const { days } = req.body;
    if (!days || days < 1) {
      return res.status(400).json({ error: '請提供有效天數' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(days));

    const result = await pool.query(
      `UPDATE users SET status='active', expires_at=$1, updated_at=NOW()
       WHERE id=$2 AND role != 'admin'
       RETURNING id, nickname, username, status, expires_at`,
      [expiresAt, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '使用者不存在' });
    }

    await pool.query(
      'INSERT INTO admin_logs (admin_id, action, target_user_id, detail) VALUES ($1,$2,$3,$4)',
      [req.user.id, 'activate', id, `開通${days}天`]
    );

    res.json({ message: `已開通 ${days} 天`, user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 取消權限（回 pending）
router.post('/users/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET status='pending', expires_at=NULL, updated_at=NOW()
       WHERE id=$1 AND role != 'admin'
       RETURNING id, nickname, username, status`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '使用者不存在' });

    await pool.query(
      'INSERT INTO admin_logs (admin_id, action, target_user_id, detail) VALUES ($1,$2,$3,$4)',
      [req.user.id, 'revoke', id, '取消權限']
    );

    res.json({ message: '已取消權限', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 停用帳號
router.post('/users/:id/disable', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE users SET status='disabled', updated_at=NOW()
       WHERE id=$1 AND role != 'admin'
       RETURNING id, nickname, username, status`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '使用者不存在' });

    await pool.query(
      'INSERT INTO admin_logs (admin_id, action, target_user_id, detail) VALUES ($1,$2,$3,$4)',
      [req.user.id, 'disable', id, '停用帳號']
    );

    res.json({ message: '已停用帳號', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 取得技術參數
router.get('/params', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tech_params ORDER BY id');
    res.json({ params: result.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 更新技術參數
router.put('/params', async (req, res) => {
  try {
    const { params } = req.body;
    if (!params || typeof params !== 'object') {
      return res.status(400).json({ error: '參數格式錯誤' });
    }
    for (const [key, value] of Object.entries(params)) {
      await pool.query(
        'UPDATE tech_params SET param_value=$1, updated_at=NOW() WHERE param_key=$2',
        [String(value), key]
      );
    }
    res.json({ message: '參數已更新' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 重置技術參數
router.post('/params/reset', async (req, res) => {
  try {
    await pool.query('UPDATE tech_params SET param_value=param_default, updated_at=NOW()');
    res.json({ message: '已重置為預設值' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// ===== 每日報告管理 =====

router.get('/reports', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.nickname as author_name
       FROM reports r LEFT JOIN users u ON r.created_by = u.id
       ORDER BY r.report_date DESC, r.created_at DESC`
    );
    res.json({ reports: result.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.post('/reports', async (req, res) => {
  try {
    const { title, report_date, market_trend, summary, content, status } = req.body;
    const result = await pool.query(
      `INSERT INTO reports (title, report_date, market_trend, summary, content, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, report_date, market_trend, summary, JSON.stringify(content || {}), status || 'draft', req.user.id]
    );
    res.json({ report: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.put('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, report_date, market_trend, summary, content, status } = req.body;
    const result = await pool.query(
      `UPDATE reports SET title=$1, report_date=$2, market_trend=$3, summary=$4,
       content=$5, status=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [title, report_date, market_trend, summary, JSON.stringify(content || {}), status, id]
    );
    res.json({ report: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.delete('/reports/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM reports WHERE id=$1', [req.params.id]);
    res.json({ message: '已刪除' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// AI 生成報告
router.post('/reports/ai-generate', async (req, res) => {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('zh-TW');
    const isOpen = now.getHours() >= 9 && now.getHours() < 14;

    const prompt = `你是一位專業的台股分析師，請根據今日市場狀況產出一份台股操作報告。

今日日期：${today}
市場狀態：${isOpen ? '盤中' : '收盤後'}

請只回傳以下格式的JSON，不要其他文字：
{
  "title": "報告標題（含日期）",
  "market_trend": "bullish或bearish或sideways",
  "summary": "核心摘要約200字，包含資金面、主力動向、風險提示",
  "conclusion": "今日操作建議約100字"
}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI回傳格式錯誤');
    const aiData = JSON.parse(jsonMatch[0]);

    const reportDate = now.toISOString().split('T')[0];
    const dbResult = await pool.query(
      `INSERT INTO reports (title, report_date, market_trend, summary, content, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'draft',$6) RETURNING *`,
      [aiData.title, reportDate, aiData.market_trend, aiData.summary, JSON.stringify({ conclusion: aiData.conclusion }), req.user.id]
    );

    res.json({ message: 'AI報告已生成', report: dbResult.rows[0] });
  } catch (err) {
    console.error('AI錯誤:', err.message);
    res.status(500).json({ error: 'AI生成失敗：' + err.message });
  }
});


module.exports = router;
