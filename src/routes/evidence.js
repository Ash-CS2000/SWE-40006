const express = require('express');
const db = require('../db');
const { parseId } = require('../utils/validation');

const router = express.Router();

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_EVIDENCE_PER_TASK = 10;

// Work out the file type from its first bytes ("magic numbers") instead of
// trusting the browser's Content-Type or the file extension, which anyone can
// fake. Only these types are accepted.
function detectFileType(buffer) {
  const startsWith = (bytes, offset = 0) => bytes.every((b, i) => buffer[offset + i] === b);

  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // "%PDF-"
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // "GIF8"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'; // "RIFF....WEBP"
  return null;
}

// The browser sends the original filename URL-encoded in a header.
// Keep only the last path part, drop control characters, and cap the length.
function cleanFilename(raw) {
  let name = '';
  try {
    name = decodeURIComponent(String(raw || ''));
  } catch {
    name = '';
  }
  name = name.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').trim();
  return name.slice(0, 200) || 'evidence';
}

// Reads the request body as raw bytes (a Buffer). Turns "too large" into a
// friendly message instead of Express's default "request entity too large".
const readRawBody = express.raw({ type: () => true, limit: MAX_EVIDENCE_BYTES });
function parseUpload(req, res, next) {
  readRawBody(req, res, (err) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'File must be 5 MB or smaller' });
    }
    next(err);
  });
}

// POST /api/tasks/:id/evidence  (mounted from routes/tasks.js)
// Body: the file's raw bytes. Header X-Filename: the original filename.
async function uploadEvidence(req, res) {
  const taskId = parseId(req.params.id);
  const { rows: owned } = taskId
    ? await db.query('SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2', [taskId, req.session.userId])
    : { rows: [] };
  if (!owned.length) return res.status(404).json({ error: 'Task not found' });

  const file = req.body;
  if (!Buffer.isBuffer(file) || file.length === 0) {
    return res.status(400).json({ error: 'Choose a file to upload' });
  }

  const mimeType = detectFileType(file);
  if (!mimeType) {
    return res.status(400).json({ error: 'Only PDF or image files (PNG, JPEG, GIF, WebP) are allowed' });
  }

  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS total FROM task_evidence WHERE task_id = $1',
    [taskId]
  );
  if (countRows[0].total >= MAX_EVIDENCE_PER_TASK) {
    return res.status(400).json({ error: `A task can have at most ${MAX_EVIDENCE_PER_TASK} evidence files` });
  }

  const { rows } = await db.query(
    `INSERT INTO task_evidence (task_id, filename, mime_type, size_bytes, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, filename, mime_type, size_bytes, created_at`,
    [taskId, cleanFilename(req.get('X-Filename')), mimeType, file.length, file]
  );
  res.status(201).json(rows[0]);
}

// Evidence belongs to the user through its parent task, so every query joins
// on tasks to check ownership (same approach as subtasks).

// GET /api/evidence/:id  -> the file itself, shown in the browser
router.get('/:id', async (req, res) => {
  const evidenceId = parseId(req.params.id);
  const { rows } = evidenceId
    ? await db.query(
        `SELECT e.filename, e.mime_type, e.data
         FROM task_evidence e JOIN tasks t ON t.id = e.task_id
         WHERE e.id = $1 AND t.user_id = $2`,
        [evidenceId, req.session.userId]
      )
    : { rows: [] };
  if (!rows.length) return res.status(404).json({ error: 'Evidence not found' });

  const { filename, mime_type: mimeType, data } = rows[0];
  // ASCII-only fallback name for old browsers, plus the full UTF-8 name.
  const asciiName = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  res.set({
    'Content-Type': mimeType,
    'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'X-Content-Type-Options': 'nosniff', // never let the browser guess a different type
    'Cache-Control': 'private, no-store',
  });
  res.send(data);
});

router.delete('/:id', async (req, res) => {
  const evidenceId = parseId(req.params.id);
  const { rowCount } = evidenceId
    ? await db.query(
        `DELETE FROM task_evidence e USING tasks t
         WHERE e.task_id = t.id AND e.id = $1 AND t.user_id = $2`,
        [evidenceId, req.session.userId]
      )
    : { rowCount: 0 };
  if (!rowCount) return res.status(404).json({ error: 'Evidence not found' });
  res.status(204).end();
});

module.exports = { router, parseUpload, uploadEvidence, detectFileType, MAX_EVIDENCE_BYTES };
