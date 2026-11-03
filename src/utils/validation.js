// Pure validation helpers. They don't touch the database, which makes them
// easy to unit test.

const PRIORITIES = ['low', 'medium', 'high'];
const THEMES = ['light', 'dark', 'system'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 255 && EMAIL_RE.test(email);
}

function isValidColor(color) {
  return typeof color === 'string' && COLOR_RE.test(color);
}

// Returns an error message, or null if the password is acceptable.
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password.length > 72) {
    return 'Password must be 72 characters or fewer';
  }
  return null;
}

function validateName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return { error: 'Name is required' };
  if (trimmed.length > 100) return { error: 'Name must be 100 characters or fewer' };
  return { value: trimmed };
}

function validateRegistration(input = {}) {
  const errors = [];
  const name = validateName(input.name);
  if (name.error) errors.push(name.error);

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) errors.push('Please enter a valid email address');

  const passwordError = validatePassword(input.password);
  if (passwordError) errors.push(passwordError);

  return { errors, value: { name: name.value, email, password: input.password } };
}

// Validates a task from the request body. With partial = true (used for
// updates), only the fields that were sent are checked.
// Returns { errors, value } where value only contains valid, cleaned fields.
function validateTaskInput(input = {}, { partial = false } = {}) {
  const errors = [];
  const value = {};

  if (input.title !== undefined || !partial) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) errors.push('Title is required');
    else if (title.length > 200) errors.push('Title must be 200 characters or fewer');
    else value.title = title;
  }

  if (input.description !== undefined) {
    if (typeof input.description !== 'string') errors.push('Description must be text');
    else if (input.description.length > 2000) errors.push('Description must be 2000 characters or fewer');
    else value.description = input.description.trim();
  }

  if (input.due_date !== undefined) {
    if (input.due_date === null || input.due_date === '') {
      value.due_date = null;
    } else {
      const date = new Date(input.due_date);
      if (Number.isNaN(date.getTime())) errors.push('Due date is not a valid date');
      else value.due_date = date.toISOString();
    }
  }

  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(input.priority)) errors.push('Priority must be low, medium or high');
    else value.priority = input.priority;
  }

  if (input.category_id !== undefined) {
    if (input.category_id === null || input.category_id === '') {
      value.category_id = null;
    } else {
      const id = parseId(input.category_id);
      if (!id) errors.push('Category is not valid');
      else value.category_id = id;
    }
  }

  if (input.completed !== undefined) {
    if (typeof input.completed !== 'boolean') errors.push('Completed must be true or false');
    else value.completed = input.completed;
  }

  return { errors, value };
}

module.exports = {
  PRIORITIES,
  THEMES,
  parseId,
  isValidEmail,
  isValidColor,
  validatePassword,
  validateName,
  validateRegistration,
  validateTaskInput,
};
