'use strict';

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// Switch between the "Sign in" and "Create account" tabs
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const showLogin = tab.dataset.tab === 'login';
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    loginForm.hidden = !showLogin;
    registerForm.hidden = showLogin;
  });
});

async function submitAuth(form, url, body) {
  const errorBox = form.querySelector('.form-error');
  const button = form.querySelector('button[type="submit"]');
  errorBox.hidden = true;
  button.disabled = true;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');

    try { localStorage.setItem('theme', data.theme); } catch (e) { /* storage blocked */ }
    location.href = '/';
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
    button.disabled = false;
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(loginForm);
  submitAuth(loginForm, '/api/auth/login', {
    email: data.get('email'),
    password: data.get('password'),
  });
});

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(registerForm);
  submitAuth(registerForm, '/api/auth/register', {
    name: data.get('name'),
    email: data.get('email'),
    password: data.get('password'),
  });
});
