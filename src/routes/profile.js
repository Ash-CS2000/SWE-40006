const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { USER_COLUMNS, findUserById } = require('../utils/users');
const { isValidEmail, validateName, validatePassword } = require('../utils/validation');

const router = express.Router();

router.get('/', async (req, res) => {
  res.json(await findUserById(req.session.userId));
});

// Update display name and email
router.patch('/', async (req, res) => {
  const body = req.body || {};
  const name = validateName(body.name);
  if (name.error) return res.status(400).json({ error: name.error });

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });

  try {
    const { rows } = await db.query(
      `UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING ${USER_COLUMNS}`,
      [name.value, email, req.session.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already used by another account' });
    throw err;
  }
});

async function checkPassword(userId, password) {
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  return Boolean(rows[0]) && typeof password === 'string' && bcrypt.compare(password, rows[0].password_hash);
}

router.put('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!(await checkPassword(req.session.userId, currentPassword))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const error = validatePassword(newPassword);
  if (error) return res.status(400).json({ error });

  const hash = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);
  res.status(204).end();
});

// Deleting the user also deletes their tasks, categories and subtasks
// (ON DELETE CASCADE in the schema).
router.delete('/', async (req, res) => {
  if (!(await checkPassword(req.session.userId, req.body?.password))) {
    return res.status(400).json({ error: 'Password is incorrect' });
  }
  await db.query('DELETE FROM users WHERE id = $1', [req.session.userId]);
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

module.exports = router;
