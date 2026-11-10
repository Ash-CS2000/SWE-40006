'use strict';

// TC-S01: Check the Dockerized TaskFlow application and its disposable PostgreSQL DB.
// Requires `compose.smoke.yml` to be running locally on port 3030.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3030';
const EXPECTED_VERSION = process.env.SMOKE_EXPECTED_VERSION || 'member2-smoke';

async function request(method, path, body, sessionCookie) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(sessionCookie ? { cookie: sessionCookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  const rawBody = await response.text();
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    data = rawBody; // Login page is HTML rather than JSON.
  }
  return {
    status: response.status,
    data,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}

test('TC-S01: Docker container starts and TaskFlow can use PostgreSQL', async () => {
  // 1. A healthy /health response verifies the running app can reach PostgreSQL.
  const health = await request('GET', '/health');
  assert.equal(health.status, 200, 'Application health endpoint should return HTTP 200');
  assert.equal(health.data.status, 'ok');
  assert.equal(health.data.database, 'connected');
  assert.equal(health.data.version, EXPECTED_VERSION);

  // 2. Verify the frontend is served by the running application container.
  const login = await request('GET', '/login');
  assert.equal(login.status, 200);
  assert.match(login.data, /<html/i);

  // 3. Verify the authenticated API uses the PostgreSQL database.
  const email = `smoke-${randomUUID()}@example.test`;
  const registration = await request('POST', '/api/auth/register', {
    name: 'Member 2 Smoke Tester',
    email,
    password: 'SmokeTestPassword123!',
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.data));
  assert.ok(registration.cookie, 'Registration must set a session cookie');

  const created = await request('POST', '/api/tasks', {
    title: 'Member 2 Docker smoke task',
  }, registration.cookie);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.ok(Number.isInteger(created.data.id));

  const listed = await request('GET', '/api/tasks', undefined, registration.cookie);
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.data));
  assert.ok(listed.data.some((task) => task.id === created.data.id));
});
