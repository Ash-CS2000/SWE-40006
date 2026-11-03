'use strict';

// Small helpers shared by the app.

const $ = (selector, root = document) => root.querySelector(selector);

// Call the backend API and return the JSON response.
// Throws an Error with the server's message if the request fails.
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Session expired or signed out in another tab
    location.href = '/login';
    throw new Error('Please sign in');
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}

// Always use this before putting user-typed text into innerHTML,
// otherwise a task called "<script>..." could run code (XSS).
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}
