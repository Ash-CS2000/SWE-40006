"use strict";

// Five real TaskFlow API tests against a disposable LOCAL PostgreSQL database.
// NEVER point DATABASE_URL at Member 1's database or the production database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const rawUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV !== 'test' || !rawUrl) {
  throw new Error('Set NODE_ENV=test and DATABASE_URL to the temporary test database');
}
let url;
try { url = new URL(rawUrl); } catch { throw new Error('Invalid DATABASE_URL'); }
if (!['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/taskflow_test' ||
    !['55432', '5432'].includes(url.port || '5432')) {
  throw new Error('Refusing to run against anything other than local taskflow_test PostgreSQL');
}

process.env.SESSION_SECRET ||= 'local-test-secret-do-not-use-in-production';
const { initDb, pool } = require('../src/db');
const app = require('../src/app');
const createdEmails = new Set();
const PASSWORD = 'TestPassword123!';
let server;
let baseUrl;

async function startApp() {
  server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}
async function stopApp() {
  if (!server) return;
  const instance = server;
  server = null;
  instance.closeAllConnections?.();
  await new Promise((resolve, reject) => instance.close(err => err ? reject(err) : resolve()));
}
async function api(method, endpoint, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const res = await fetch(baseUrl + endpoint, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
async function register() {
  const email = `m2-${randomUUID()}@example.test`;
  const response = await api('POST', '/api/auth/register', {
    name: 'Member Two', email, password: PASSWORD,
  });
  assert.equal(response.status, 201, `Registration failed: ${JSON.stringify(response.data)}`);
  assert.ok(response.cookie, 'Registration must create an authenticated session');
  createdEmails.add(email);
  return { email, cookie: response.cookie };
}

before(async () => {
  await initDb({ retries: 2, delayMs: 500 });
  await startApp();
});
after(async () => {
  try {
    // Clean up only accounts made by these tests. Related tasks cascade-delete.
    if (createdEmails.size) {
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[...createdEmails]]);
    }
  } finally {
    await stopApp();
    await pool.end();
  }
});

test('TC-I01: register and log in with PostgreSQL-backed account', async () => {
  const user = await register();
  const login = await api('POST', '/api/auth/login', {
    email: user.email, password: PASSWORD,
  });
  assert.equal(login.status, 200);
  assert.ok(login.cookie);
  const profile = await api('GET', '/api/auth/me', undefined, login.cookie);
  assert.equal(profile.status, 200);
  assert.equal(profile.data.email, user.email);
});

test('TC-I02: create and retrieve a stored task', async () => {
  const user = await register();
  const created = await api('POST', '/api/tasks', {
    title: '  Finish DevOps tests  ', priority: 'high',
  }, user.cookie);
  assert.equal(created.status, 201);
  assert.equal(created.data.title, 'Finish DevOps tests');
  assert.ok(Number.isInteger(created.data.id));
  const retrieved = await api('GET', `/api/tasks/${created.data.id}`, undefined, user.cookie);
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.data.id, created.data.id);
});

test('TC-I03: edit and complete a task', async () => {
  const user = await register();
  const created = await api('POST', '/api/tasks', { title: 'Original task' }, user.cookie);
  assert.equal(created.status, 201);
  const updated = await api('PATCH', `/api/tasks/${created.data.id}`, {
    title: 'Updated task', completed: true,
  }, user.cookie);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.title, 'Updated task');
  assert.equal(updated.data.completed, true);
  const stored = await api('GET', `/api/tasks/${created.data.id}`, undefined, user.cookie);
  assert.equal(stored.status, 200);
  assert.equal(stored.data.completed, true);
});

test('TC-I04: delete a task from PostgreSQL', async () => {
  const user = await register();
  const created = await api('POST', '/api/tasks', { title: 'Delete this task' }, user.cookie);
  assert.equal(created.status, 201);
  const removed = await api('DELETE', `/api/tasks/${created.data.id}`, undefined, user.cookie);
  assert.equal(removed.status, 204);
  const missing = await api('GET', `/api/tasks/${created.data.id}`, undefined, user.cookie);
  assert.equal(missing.status, 404);
});

test('TC-I05: task persists when the HTTP server restarts', async () => {
  const user = await register();
  const created = await api('POST', '/api/tasks', { title: 'Persistent task' }, user.cookie);
  assert.equal(created.status, 201);
  await stopApp();
  await startApp();
  const login = await api('POST', '/api/auth/login', {
    email: user.email, password: PASSWORD,
  });
  assert.equal(login.status, 200);
  const retrieved = await api('GET', `/api/tasks/${created.data.id}`, undefined, login.cookie);
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.data.title, 'Persistent task');
});
