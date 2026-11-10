const test = require('node:test');
const assert = require('node:assert/strict');

test('DEMO: intentional failure stops the CI pipeline', () => {
  assert.equal(1, 2);
});