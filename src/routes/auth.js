const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { USER_COLUMNS, findUserById } = require('../utils/users');
const { validateRegistration } = require('../utils/validation');

const router = express.Router();

const DEFAULT_CATEGORIES = [
  { name: 'Work', color: '#5b5fc7' },
  { name: 'Personal', color: '#2f7d6d' },
  { name: 'Study', color: '#b5762b' },
];

// Give the user a fresh session ID on login, so an old session ID can't be reused.
function startSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      resolve();
    });
  });
}

router.post('/register', async (req, res) => {
  const body = req.body || {};
  const { errors, value } = validateRegistration(body);
  if (errors.length) return res.status(400).json({ error: errors[0] });

  const passwordHash = await bcrypt.hash(value.password, 10);

  let user;
  try {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
      [value.name, value.email, passwordHash]
    );
    user = rows[0];
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    throw err;
  }

  for (const category of DEFAULT_CATEGORIES) {
    await db.query('INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3)', [
      user.id,
      category.name,
      category.color,
    ]);
  }

  await startSession(req, user.id);
  res.status(201).json(user);
});

router.post('/login', async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const { rows } = await db.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
  const match = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!match) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  await startSession(req, rows[0].id);
  res.json(await findUserById(rows[0].id));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);
  if (!user) {
    // The account was deleted while this session was still active.
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Please sign in' });
  }
  res.json(user);
});

module.exports = router;
