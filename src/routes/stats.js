const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE NOT completed)::int AS active,
       COUNT(*) FILTER (WHERE completed)::int AS completed,
       COUNT(*) FILTER (WHERE NOT completed AND due_date < NOW())::int AS overdue,
       COUNT(*) FILTER (WHERE completed AND completed_at >= NOW() - INTERVAL '7 days')::int AS completed_this_week
     FROM tasks
     WHERE user_id = $1`,
    [req.session.userId]
  );
  res.json(rows[0]);
});

module.exports = router;
