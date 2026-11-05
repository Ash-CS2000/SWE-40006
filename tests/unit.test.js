const test = require('node:test');
const assert = require('node:assert/strict');

test('DEMO: Failed test should block deployment', () => {
  assert.equal(1, 2);
});