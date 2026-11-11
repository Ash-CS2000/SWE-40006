'use strict';

// These tests use the real validation functions in Member 1's application.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTaskInput, parseId } = require('../src/utils/validation');

test('TC-U01: accepts a valid task title and removes surrounding spaces', () => {
  const result = validateTaskInput({ title: '  DevOps Assignment  ' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.title, 'DevOps Assignment');
});

test('TC-U02: rejects an empty or whitespace-only task title', () => {
  for (const title of ['', '   ']) {
    const result = validateTaskInput({ title });
    assert.ok(result.errors.includes('Title is required'));
  }
});

test('TC-U03: rejects invalid task IDs', () => {
  for (const id of [0, -1, 'abc', '1.5']) {
    assert.equal(parseId(id), null);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');

test('Intentional failure: pipeline demo', () => {
  assert.fail('Deliberate failure to verify CI blocks deployment');
});



// TC-U04: prevent unsupported priority values
test('TC-U04: task priority accepts only low, medium or high', () => {
  for (const priority of ['low', 'medium', 'high']) {
    assert.deepEqual(validateTaskInput({ title: 'Task', priority }).errors, []);
  }
  assert.ok(
    validateTaskInput({ title: 'Task', priority: 'urgent' }).errors.includes(
      'Priority must be low, medium or high'
    )
  );
});

