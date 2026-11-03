const express = require('express');
const db = require('../db');
const { parseId, isValidColor } = require('../utils/validation');

const router = express.Router();

function cleanName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.color,
            COUNT(t.id) FILTER (WHERE NOT t.completed)::int AS active_count
     FROM categories c
     LEFT JOIN tasks t ON t.category_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.name`,
    [req.session.userId]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const name = cleanName(body.name);
  if (!name || name.length > 50) return res.status(400).json({ error: 'Name must be 1-50 characters' });
  if (!isValidColor(body.color)) return res.status(400).json({ error: 'Colour is not valid' });

  try {
    const { rows } = await db.query(
      'INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color',
      [req.session.userId, name, body.color]
    );
    res.status(201).json({ ...rows[0], active_count: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already have a category with that name' });
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const categoryId = parseId(req.params.id);
  const body = req.body || {};
  const name = cleanName(body.name);
  if (!name || name.length > 50) return res.status(400).json({ error: 'Name must be 1-50 characters' });
  if (!isValidColor(body.color)) return res.status(400).json({ error: 'Colour is not valid' });
  if (!categoryId) return res.status(404).json({ error: 'Category not found' });

  try {
    const { rows } = await db.query(
      'UPDATE categories SET name = $1, color = $2 WHERE id = $3 AND user_id = $4 RETURNING id, name, color',
      [name, body.color, categoryId, req.session.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already have a category with that name' });
    throw err;
  }
});

// Tasks in a deleted category are kept; they just become uncategorised.
router.delete('/:id', async (req, res) => {
  const categoryId = parseId(req.params.id);
  const { rowCount } = categoryId
    ? await db.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [categoryId, req.session.userId])
    : { rowCount: 0 };
  if (!rowCount) return res.status(404).json({ error: 'Category not found' });
  res.status(204).end();
});

module.exports = router;
