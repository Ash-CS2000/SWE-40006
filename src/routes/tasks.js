const express = require('express');
const db = require('../db');
const { PRIORITIES, parseId, validateTaskInput } = require('../utils/validation');
const { parseUpload, uploadEvidence } = require('./evidence');

const router = express.Router();

const TASK_SELECT = `
  SELECT t.id, t.title, t.description, t.due_date, t.priority, t.completed,
         t.completed_at, t.category_id, t.created_at,
         c.name AS category_name, c.color AS category_color,
         (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id)::int AS subtask_total,
         (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.completed)::int AS subtask_done,
         -- Evidence file names/types (not the file bytes) so the task list can show them
         (SELECT COALESCE(json_agg(json_build_object('id', e.id, 'filename', e.filename, 'mime_type', e.mime_type)
                                   ORDER BY e.created_at, e.id), '[]')
          FROM task_evidence e WHERE e.task_id = t.id) AS evidence_files
  FROM tasks t
  LEFT JOIN categories c ON c.id = t.category_id`;

// "Smart sorting": unfinished before finished, overdue first, then by
// priority, then by the nearest due date.
const SMART_ORDER = `
  ORDER BY t.completed ASC,
           CASE WHEN NOT t.completed AND t.due_date < NOW() THEN 0 ELSE 1 END,
           CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
           t.due_date ASC NULLS LAST,
           t.created_at DESC`;

async function categoryBelongsToUser(categoryId, userId) {
  const { rows } = await db.query('SELECT 1 FROM categories WHERE id = $1 AND user_id = $2', [
    categoryId,
    userId,
  ]);
  return rows.length > 0;
}

async function findTask(taskId, userId) {
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.id = $1 AND t.user_id = $2`, [taskId, userId]);
  return rows[0] || null;
}

// GET /api/tasks?status=active|completed|overdue&category=<id>|none&priority=high&q=text
router.get('/', async (req, res) => {
  const { status, category, priority, q } = req.query;
  const params = [req.session.userId];
  const where = ['t.user_id = $1'];

  if (status === 'active') where.push('NOT t.completed');
  else if (status === 'completed') where.push('t.completed');
  else if (status === 'overdue') where.push('NOT t.completed AND t.due_date < NOW()');

  if (category === 'none') {
    where.push('t.category_id IS NULL');
  } else if (parseId(category)) {
    params.push(parseId(category));
    where.push(`t.category_id = $${params.length}`);
  }

  if (PRIORITIES.includes(priority)) {
    params.push(priority);
    where.push(`t.priority = $${params.length}`);
  }

  if (typeof q === 'string' && q.trim()) {
    params.push(`%${q.trim()}%`);
    where.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
  }

  const { rows } = await db.query(`${TASK_SELECT} WHERE ${where.join(' AND ')} ${SMART_ORDER}`, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const taskId = parseId(req.params.id);
  const task = taskId && (await findTask(taskId, req.session.userId));
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { rows: subtasks } = await db.query(
    'SELECT id, title, completed FROM subtasks WHERE task_id = $1 ORDER BY created_at, id',
    [taskId]
  );
  // List evidence without the file bytes; the file itself is fetched separately.
  const { rows: evidence } = await db.query(
    `SELECT id, filename, mime_type, size_bytes, created_at
     FROM task_evidence WHERE task_id = $1 ORDER BY created_at, id`,
    [taskId]
  );
  res.json({ ...task, subtasks, evidence });
});

router.post('/', async (req, res) => {
  const { errors, value } = validateTaskInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0] });

  if (value.category_id && !(await categoryBelongsToUser(value.category_id, req.session.userId))) {
    return res.status(400).json({ error: 'Category not found' });
  }

  const { rows } = await db.query(
    `INSERT INTO tasks (user_id, title, description, due_date, priority, category_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      req.session.userId,
      value.title,
      value.description || '',
      value.due_date || null,
      value.priority || 'medium',
      value.category_id || null,
    ]
  );
  res.status(201).json(await findTask(rows[0].id, req.session.userId));
});

router.patch('/:id', async (req, res) => {
  const taskId = parseId(req.params.id);
  if (!taskId) return res.status(404).json({ error: 'Task not found' });

  const { errors, value } = validateTaskInput(req.body || {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors[0] });

  if (value.category_id && !(await categoryBelongsToUser(value.category_id, req.session.userId))) {
    return res.status(400).json({ error: 'Category not found' });
  }

  // Build "SET col = $n" from the validated fields only. The column names come
  // from validateTaskInput, never directly from the request.
  const sets = [];
  const params = [];
  for (const [column, columnValue] of Object.entries(value)) {
    params.push(columnValue);
    sets.push(`${column} = $${params.length}`);
  }
  if ('completed' in value) {
    sets.push(value.completed ? 'completed_at = NOW()' : 'completed_at = NULL');
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(taskId, req.session.userId);
  const { rowCount } = await db.query(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
    params
  );
  if (!rowCount) return res.status(404).json({ error: 'Task not found' });

  res.json(await findTask(taskId, req.session.userId));
});

router.delete('/:id', async (req, res) => {
  const taskId = parseId(req.params.id);
  const { rowCount } = taskId
    ? await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [taskId, req.session.userId])
    : { rowCount: 0 };
  if (!rowCount) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

// Subtasks ("steps") belonging to a task
router.post('/:id/subtasks', async (req, res) => {
  const taskId = parseId(req.params.id);
  const task = taskId && (await findTask(taskId, req.session.userId));
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'Step title is required' });
  if (title.length > 200) return res.status(400).json({ error: 'Step title must be 200 characters or fewer' });

  const { rows } = await db.query(
    'INSERT INTO subtasks (task_id, title) VALUES ($1, $2) RETURNING id, title, completed',
    [taskId, title]
  );
  res.status(201).json(rows[0]);
});

// Evidence files (PDF or image) attached to a task
router.post('/:id/evidence', parseUpload, uploadEvidence);

module.exports = router;
