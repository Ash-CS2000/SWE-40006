const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// One shared pool of connections. The connection string comes from the
// environment so each environment (laptop, CI, EC2) can point at its own DB.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function query(text, params) {
  return pool.query(text, params);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Create the tables if they don't exist yet. Retries a few times because in
// Docker the database container may still be starting when the app starts.
async function initDb({ retries = 10, delayMs = 3000 } = {}) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(schema);
      console.log('[db] Connected and schema is ready');
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[db] Not ready (${err.message}). Retrying in ${delayMs / 1000}s... (${attempt}/${retries})`);
      await wait(delayMs);
    }
  }
}

module.exports = { pool, query, initDb };
