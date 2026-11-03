const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { pool } = require('./db');
const { requireAuth } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const subtaskRoutes = require('./routes/subtasks');
const categoryRoutes = require('./routes/categories');
const profileRoutes = require('./routes/profile');
const settingsRoutes = require('./routes/settings');
const statsRoutes = require('./routes/stats');

// This file builds the app but does not start listening (that's server.js).
// Keeping them separate lets tests import the app directly.
const app = express();
const publicDir = path.join(__dirname, '..', 'public');

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.warn('[app] WARNING: SESSION_SECRET is not set. Set it in production.');
}

app.use(express.json({ limit: '100kb' }));

// Health check for deployment verification and monitoring.
// Confirms the app is running AND can reach PostgreSQL.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', version: process.env.APP_VERSION || 'dev' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected', version: process.env.APP_VERSION || 'dev' });
  }
});

// CSS, JS and images. index: false so "/" goes through the login check below.
app.use(express.static(publicDir, { index: false }));

// Sessions are stored in PostgreSQL, so users stay signed in after a redeploy.
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// Pages
app.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.sendFile(path.join(publicDir, 'login.html'));
});

// API
app.use('/api/auth', authRoutes);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/subtasks', requireAuth, subtaskRoutes);
app.use('/api/categories', requireAuth, categoryRoutes);
app.use('/api/profile', requireAuth, profileRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/stats', requireAuth, statsRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Anything else goes back to the app
app.use((req, res) => {
  res.redirect('/');
});

// Errors thrown in any route end up here (Express 5 catches async errors).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.expose) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

module.exports = app;
