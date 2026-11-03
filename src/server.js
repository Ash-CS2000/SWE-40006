require('dotenv').config({ quiet: true });

const app = require('./app');
const { initDb } = require('./db');

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[app] TaskFlow running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[app] Failed to start:', err.message);
  process.exit(1);
});
