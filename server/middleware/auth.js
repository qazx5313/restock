const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未登入' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // 檢查使用者狀態
    const result = await pool.query(
      'SELECT id, username, nickname, role, status, expires_at FROM users WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '使用者不存在' });
    }
    const user = result.rows[0];

    // 自動更新過期狀態
    if (user.status === 'active' && user.expires_at && new Date(user.expires_at) < new Date()) {
      await pool.query("UPDATE users SET status='expired' WHERE id=$1", [user.id]);
      user.status = 'expired';
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ error: '帳號已停用' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效或已過期' });
  }
}

function requireActive(req, res, next) {
  if (req.user.role === 'admin') return next();
  if (req.user.status !== 'active') {
    return res.status(403).json({ error: '帳號未開通，請聯繫管理員', status: req.user.status });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '無管理員權限' });
  }
  next();
}

module.exports = { generateToken, authMiddleware, requireActive, requireAdmin };
