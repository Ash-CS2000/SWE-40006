const express = require('express');
const db = require('../db');
const { findUserById } = require('../utils/users');
const { THEMES } = require('../utils/validation');

const router = express.Router();

router.get('/', async (req, res) => {
  const user = await findUserById(req.session.userId);
  res.json({ theme: user.theme });
});

router.patch('/', async (req, res) => {
  const theme = req.body?.theme;
  if (!THEMES.includes(theme)) return res.status(400).json({ error: 'Theme is not valid' });

  await db.query('UPDATE users SET theme = $1 WHERE id = $2', [theme, req.session.userId]);
  res.json({ theme });
});

module.exports = router;
