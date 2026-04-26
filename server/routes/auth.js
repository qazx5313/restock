const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 註冊
router.post('/register', async (req, res) => {
  try {
    const { nickname, username, password } = req.body;
    if (!nickname || !username || !password) {
      return res.status(400).json({ error: '請填寫所有欄位' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '帳號長度須為3-20字元' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密碼至少6字元' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: '帳號只能包含英數字與底線' });
    }

    const exists = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: '帳號已被使用' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (nickname, username, password_hash, status) VALUES ($1,$2,$3,'pending') RETURNING id, nickname, username, status`,
      [nickname, username, hash]
    );
    res.json({ message: '註冊成功，請等待管理員開通', user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 登入
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '請填寫帳號密碼' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username=$1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    const user = result.rows[0];
    if (user.status === 'disabled') {
      return res.status(403).json({ error: '帳號已停用' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    // 自動更新過期
    if (user.status === 'active' && user.expires_at && new Date(user.expires_at) < new Date()) {
      await pool.query("UPDATE users SET status='expired' WHERE id=$1", [user.id]);
      user.status = 'expired';
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        username: user.username,
        role: user.role,
        status: user.status,
        expires_at: user.expires_at,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 取得目前登入資訊
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
