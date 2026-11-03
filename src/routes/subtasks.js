const express = require('express');
const db = require('../db');
const { parseId } = require('../utils/validation');

const router = express.Router();

// A subtask belongs to the user through its parent task, so every query joins
// on tasks to check ownership.
router.patch('/:id', async (req, res) => {
  const subtaskId = parseId(req.params.id);
  const body = req.body || {};
  const sets = [];
  const params = [];

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 200) return res.status(400).json({ error: 'Step title is not valid' });
    params.push(title);
    sets.push(`title = $${params.length}`);
  }
  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') return res.status(400).json({ error: 'Completed must be true or false' });
    params.push(body.completed);
    sets.push(`completed = $${params.length}`);
  }
  if (!subtaskId) return res.status(404).json({ error: 'Step not found' });
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(subtaskId, req.session.userId);
  const { rows } = await db.query(
    `UPDATE subtasks s SET ${sets.join(', ')}
     FROM tasks t
     WHERE s.task_id = t.id AND s.id = $${params.length - 1} AND t.user_id = $${params.length}
     RETURNING s.id, s.title, s.completed`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'Step not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const subtaskId = parseId(req.params.id);
  const { rowCount } = subtaskId
    ? await db.query(
        `DELETE FROM subtasks s USING tasks t
         WHERE s.task_id = t.id AND s.id = $1 AND t.user_id = $2`,
        [subtaskId, req.session.userId]
      )
    : { rowCount: 0 };
  if (!rowCount) return res.status(404).json({ error: 'Step not found' });
  res.status(204).end();
});

module.exports = router;
