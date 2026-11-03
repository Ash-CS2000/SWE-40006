const db = require('../db');

// Columns that are safe to send to the browser (never the password hash).
const USER_COLUMNS = 'id, name, email, theme, created_at';

async function findUserById(id) {
  const { rows } = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

module.exports = { USER_COLUMNS, findUserById };
