'use strict';

/* ==========================================================================
   App state
   ========================================================================== */

const state = {
  user: null,
  categories: [],
  filters: { category: '', priority: '', q: '' },
  refresh: null, // reloads the data on the current page after a change
  timer: null, // interval that keeps countdowns up to date
};

const CATEGORY_COLORS = ['#5b5fc7', '#2f7d6d', '#b5762b', '#a4506b', '#4a7bab', '#7a6a9c', '#5f7a3a', '#6b6b6b'];

const ICONS = {
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>',
  calendar: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  chevron: '<svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  steps: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
};

const routes = {
  home: { title: 'Home', render: renderHome },
  tasks: { title: 'Tasks', render: renderTasks },
  deadlines: { title: 'Deadlines', render: renderDeadlines },
  categories: { title: 'Categories', render: renderCategories },
  profile: { title: 'Profile', render: renderProfile },
  settings: { title: 'Settings', render: renderSettings },
};

const view = () => $('#view');

/* ==========================================================================
   Startup and navigation
   ========================================================================== */

init();

async function init() {
  state.user = await api('/auth/me');
  applyTheme(state.user.theme);
  updateRailAvatar();
  await loadCategories();

  // One click handler for task rows on every page (event delegation)
  view().addEventListener('click', onTaskListClick);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#row-menu').hidden) closeRowMenu();
    else if (!$('#panel').hidden) closePanel();
  });

  // Close the ⋮ menu when clicking anywhere else, scrolling or resizing
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#row-menu, [data-action="menu"]')) closeRowMenu();
  });
  view().addEventListener('scroll', closeRowMenu);
  window.addEventListener('resize', closeRowMenu);
  window.addEventListener('hashchange', navigate);
  navigate();
}

async function navigate() {
  const name = routes[location.hash.slice(2)] ? location.hash.slice(2) : 'home';

  document.querySelectorAll('.rail-item').forEach((link) => {
    const active = link.dataset.route === name;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  closePanel();
  closeRowMenu();
  clearInterval(state.timer);
  state.refresh = null;
  $('#page-title').textContent = routes[name].title;
  document.title = `${routes[name].title} · TaskFlow`;
  $('#topbar-actions').innerHTML = '';
  view().innerHTML = '<div class="loading">Loading…</div>';

  try {
    await routes[name].render();
  } catch (err) {
    view().innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function refresh() {
  if (state.refresh) await state.refresh();
}

/* ==========================================================================
   Small helpers
   ========================================================================== */

// Shows a short message at the bottom. Pass an action like
// { label: 'Undo', onClick } to add a button to the message.
let toastTimer;
function toast(message, isError = false, action = null) {
  const el = $('#toast');
  el.textContent = message;

  if (action) {
    const button = document.createElement('button');
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      clearTimeout(toastTimer);
      el.hidden = true;
      action.onClick();
    });
    el.append(button);
  }

  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  // Messages with a button stay longer so there's time to click it
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2800);
}

// Runs an async action and shows any error as a toast instead of crashing.
async function safely(action) {
  try {
    await action();
  } catch (err) {
    toast(err.message, true);
  }
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

function updateRailAvatar() {
  $('#rail-avatar').textContent = initials(state.user.name);
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('theme', theme); } catch (e) { /* storage blocked */ }
}

function optionsHtml(options, selected) {
  return options
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function colorPickerHtml(name, selected) {
  return `<div class="swatches" role="radiogroup" aria-label="Colour">${CATEGORY_COLORS.map((color) => `
    <label class="swatch" style="--c:${color}" title="${color}">
      <input type="radio" name="${name}" value="${color}" ${color === selected ? 'checked' : ''}>
      <span></span>
    </label>`).join('')}</div>`;
}

async function loadCategories() {
  state.categories = await api('/categories');
}

/* ---------- Dates ---------- */

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Turns a due date into friendly text like "Today 3:00 PM" or "Overdue · 2 Nov"
function describeDue(iso) {
  const due = new Date(iso);
  const now = new Date();
  const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  const time = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = due.toLocaleDateString([], { day: 'numeric', month: 'short' });

  if (due < now) return { text: `Overdue · ${dayDiff === 0 ? time : date}`, className: 'overdue' };
  if (dayDiff === 0) return { text: `Today ${time}`, className: 'today' };
  if (dayDiff === 1) return { text: `Tomorrow ${time}`, className: '' };
  if (dayDiff < 7) return { text: `${due.toLocaleDateString([], { weekday: 'short' })} ${time}`, className: '' };
  return { text: date, className: '' };
}

// Countdown text like "2 days 4 h left" or "Overdue by 3 h"
function timeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  const mins = Math.round(Math.abs(ms) / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text;
  if (mins < 60) text = `${mins} min`;
  else if (hours < 24) text = `${hours} h${mins % 60 ? ` ${mins % 60} min` : ''}`;
  else if (days < 7) text = `${days} day${days > 1 ? 's' : ''}${hours % 24 ? ` ${hours % 24} h` : ''}`;
  else text = `${days} days`;

  return ms < 0 ? `Overdue by ${text}` : `${text} left`;
}

// How urgent a deadline is: 'overdue', 'soon' (within 24 hours) or ''
function urgency(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms < 0) return 'overdue';
  if (ms < 24 * 3600000) return 'soon';
  return '';
}

// Percentage of the time between creating the task and its deadline that has passed
function timeUsedPercent(createdIso, dueIso) {
  const start = new Date(createdIso).getTime();
  const end = new Date(dueIso).getTime();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)));
}

// <input type="datetime-local"> works with local time like "2026-11-03T14:30"
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

/* ==========================================================================
   Task rows (used on Home and Tasks)
   ========================================================================== */

const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

function menuButtonHtml() {
  return `<button class="icon-btn more-btn" data-action="menu" aria-label="Task options" aria-haspopup="menu">${ICONS.more}</button>`;
}

function taskRowHtml(task) {
  const due = task.due_date ? describeDue(task.due_date) : null;
  const meta = [];

  if (task.category_name) {
    meta.push(`<span><span class="dot" style="background:${task.category_color}"></span>${escapeHtml(task.category_name)}</span>`);
  }
  if (task.completed && task.completed_at) {
    const doneDate = new Date(task.completed_at).toLocaleDateString([], { day: 'numeric', month: 'short' });
    meta.push(`<span class="done-text">${ICONS.check}Completed ${doneDate}</span>`);
  } else if (due) {
    meta.push(`<span class="due ${due.className}">${ICONS.calendar}${escapeHtml(due.text)}</span>`);
  }
  if (task.subtask_total) {
    meta.push(`<span>${ICONS.steps}${task.subtask_done}/${task.subtask_total}</span>`);
  }

  const selected = $('#panel').dataset.taskId === String(task.id) && !$('#panel').hidden;

  return `
    <li class="task-row ${task.completed ? 'is-done' : ''} ${selected ? 'selected' : ''}" data-id="${task.id}">
      <div class="task-main">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
      </div>
      ${task.completed ? '<span class="done-badge">Done</span>' : `<span class="priority priority-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>`}
      ${menuButtonHtml()}
    </li>`;
}

function onTaskListClick(e) {
  const row = e.target.closest('.task-row');
  if (!row) return;

  const menuButton = e.target.closest('[data-action="menu"]');
  if (menuButton) {
    openRowMenu(menuButton, row);
    return;
  }

  safely(() => openTaskPanel(Number(row.dataset.id)));
}

/* ---------- The "⋮" menu on each task row ---------- */

function closeRowMenu() {
  const menu = $('#row-menu');
  menu.hidden = true;
  menu.dataset.taskId = '';
}

function openRowMenu(button, row) {
  const menu = $('#row-menu');
  const id = Number(row.dataset.id);
  const isDone = row.classList.contains('is-done');
  const title = row.querySelector('.task-title').textContent;

  // Clicking the same ⋮ again closes the menu
  if (!menu.hidden && menu.dataset.taskId === String(id)) {
    closeRowMenu();
    return;
  }

  menu.dataset.taskId = String(id);
  menu.innerHTML = `
    <button type="button" role="menuitem" data-menu="edit">${ICONS.edit}Edit</button>
    <button type="button" role="menuitem" data-menu="complete">${ICONS.check}${isDone ? 'Mark as not done' : 'Mark as complete'}</button>
    <div class="menu-sep" role="separator"></div>
    <button type="button" role="menuitem" class="danger" data-menu="delete">${ICONS.trash}Delete</button>`;
  menu.hidden = false;

  // Place the menu under the ⋮ button, or above it if there's no room below
  const rect = button.getBoundingClientRect();
  let top = rect.bottom + 4;
  if (top + menu.offsetHeight > window.innerHeight - 8) top = rect.top - menu.offsetHeight - 4;
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
  menu.querySelector('button').focus();

  menu.onclick = (e) => {
    const item = e.target.closest('[data-menu]');
    if (!item) return;
    closeRowMenu();
    if (item.dataset.menu === 'edit') safely(() => openTaskPanel(id));
    if (item.dataset.menu === 'complete') completeWithUndo(id, !isDone);
    if (item.dataset.menu === 'delete') deleteTask(id, title);
  };
}

// Marks a task complete (or not). The change happens at once, with an Undo
// button in the message in case it was a mistake.
function completeWithUndo(id, completed) {
  // Reloading the page's data moves the task between the active list and
  // the Completed section on the Tasks page.
  const setCompleted = async (value) => {
    await api(`/tasks/${id}`, { method: 'PATCH', body: { completed: value } });
    await refresh();
    if ($('#panel').dataset.taskId === String(id) && !$('#panel').hidden) await openTaskPanel(id);
  };

  safely(async () => {
    await setCompleted(completed);
    toast(completed ? 'Moved to Completed' : 'Moved back to your tasks', false, {
      label: 'Undo',
      onClick: () => safely(async () => {
        await setCompleted(!completed);
        toast('Undone');
      }),
    });
  });
}

function deleteTask(id, title) {
  if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
  safely(async () => {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    if ($('#panel').dataset.taskId === String(id)) closePanel();
    toast('Task deleted');
    await refresh();
  });
}

/* ==========================================================================
   Home
   ========================================================================== */

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function statHtml(label, value, extraClass = '') {
  return `<div class="stat ${extraClass}"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

function taskSectionHtml(title, tasks) {
  if (!tasks.length) return '';
  return `<div><h2 class="section-title">${title} (${tasks.length})</h2>
    <ul class="task-list">${tasks.map(taskRowHtml).join('')}</ul></div>`;
}

async function renderHome() {
  const [stats, tasks] = await Promise.all([api('/stats'), api('/tasks?status=active')]);

  // Group active tasks by when they are due
  const now = new Date();
  const endOfToday = startOfDay(now);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(endOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const overdue = [];
  const today = [];
  const upcoming = [];
  for (const task of tasks) {
    if (!task.due_date) continue;
    const due = new Date(task.due_date);
    if (due < now) overdue.push(task);
    else if (due < endOfToday) today.push(task);
    else if (due < endOfWeek) upcoming.push(task);
  }

  const total = stats.active + stats.completed;
  const rate = total ? Math.round((stats.completed / total) * 100) : 0;
  const firstName = state.user.name.split(' ')[0];
  const nothingDue = !overdue.length && !today.length && !upcoming.length;

  view().innerHTML = `
    <p class="greeting">${greeting()}, ${escapeHtml(firstName)}</p>

    <div class="stats">
      ${statHtml('Active tasks', stats.active)}
      ${statHtml('Due today', today.length)}
      ${statHtml('Overdue', overdue.length, overdue.length ? 'danger' : '')}
      ${statHtml('Done this week', stats.completed_this_week)}
    </div>

    <section class="card">
      <div class="progress-head"><span>Completion rate</span><strong>${rate}%</strong></div>
      <div class="progress"><div style="width:${rate}%"></div></div>
      <p class="muted small">${stats.completed} of ${total} tasks completed</p>
    </section>

    ${taskSectionHtml('Overdue', overdue)}
    ${taskSectionHtml('Due today', today)}
    ${taskSectionHtml('Next 7 days', upcoming)}
    ${nothingDue ? `<div class="card empty">Nothing due this week. <a href="#/tasks">Go to your tasks</a></div>` : ''}
  `;

  state.refresh = renderHome;
}

/* ==========================================================================
   Tasks
   ========================================================================== */

async function renderTasks() {
  $('#topbar-actions').innerHTML = `<button class="btn btn-primary" id="new-task-btn">${ICONS.plus}New task</button>`;
  $('#new-task-btn').addEventListener('click', () => safely(() => openTaskPanel(null)));

  const f = state.filters;
  view().innerHTML = `
    <form class="quick-add" id="quick-add">
      <span class="quick-add-icon">${ICONS.plus}</span>
      <input id="quick-add-input" placeholder="Add a task and press Enter" maxlength="200" autocomplete="off" aria-label="Add a task">
    </form>

    <div class="toolbar">
      <input type="search" id="filter-q" placeholder="Search tasks" value="${escapeHtml(f.q)}" aria-label="Search tasks">
      <select id="filter-category" aria-label="Category">
        ${optionsHtml([['', 'All categories'], ['none', 'No category'], ...state.categories.map((c) => [c.id, c.name])], f.category)}
      </select>
      <select id="filter-priority" aria-label="Priority">
        ${optionsHtml([['', 'All priorities'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], f.priority)}
      </select>
    </div>

    <ul class="task-list" id="task-list"></ul>
    <section id="completed-section"></section>
  `;

  $('#quick-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#quick-add-input');
    const title = input.value.trim();
    if (!title) return;
    safely(async () => {
      await api('/tasks', { method: 'POST', body: { title } });
      input.value = '';
      await loadTaskList();
    });
  });

  for (const [id, key] of [['filter-category', 'category'], ['filter-priority', 'priority']]) {
    $('#' + id).addEventListener('change', (e) => {
      state.filters[key] = e.target.value;
      safely(loadTaskList);
    });
  }

  // Wait until the user stops typing before searching
  let searchTimer;
  $('#filter-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.q = e.target.value;
      safely(loadTaskList);
    }, 250);
  });

  state.refresh = loadTaskList;
  await loadTaskList();
}

// Whether the Completed section is expanded (remembered in this browser)
function completedOpen() {
  try { return localStorage.getItem('completedOpen') !== 'false'; } catch (e) { return true; }
}

async function loadTaskList() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.filters)) {
    if (value) params.set(key, value);
  }
  const tasks = await api('/tasks?' + params);

  const list = $('#task-list');
  const completedSection = $('#completed-section');
  if (!list || !completedSection) return; // user navigated away while loading

  const active = tasks.filter((t) => !t.completed);
  const done = tasks
    .filter((t) => t.completed)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)); // newest first

  const filtered = state.filters.q || state.filters.category || state.filters.priority;
  list.innerHTML = active.length
    ? active.map(taskRowHtml).join('')
    : `<li class="empty">${filtered ? 'No tasks match your filters.' : 'No tasks to do. Add one above.'}</li>`;

  // The "Completed" folder under the active tasks
  if (!done.length) {
    completedSection.innerHTML = '';
    return;
  }
  const open = completedOpen();
  completedSection.innerHTML = `
    <button type="button" class="section-toggle" id="completed-toggle" aria-expanded="${open}">
      ${ICONS.chevron}Completed <span class="muted">(${done.length})</span>
    </button>
    <ul class="task-list" id="completed-list" ${open ? '' : 'hidden'}>${done.map(taskRowHtml).join('')}</ul>
  `;
  $('#completed-toggle').addEventListener('click', (e) => {
    const nowOpen = e.currentTarget.getAttribute('aria-expanded') !== 'true';
    e.currentTarget.setAttribute('aria-expanded', String(nowOpen));
    $('#completed-list').hidden = !nowOpen;
    try { localStorage.setItem('completedOpen', String(nowOpen)); } catch (err) { /* storage blocked */ }
  });
}

/* ==========================================================================
   Deadlines
   ========================================================================== */

function deadlineRowHtml(task) {
  const level = task.completed ? 'done' : urgency(task.due_date);
  const countdown = task.completed ? 'Completed' : timeLeft(task.due_date);
  const used = timeUsedPercent(task.created_at, task.due_date);
  const exact = new Date(task.due_date).toLocaleString([], {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });

  const meta = [`<span>${ICONS.calendar}${escapeHtml(exact)}</span>`];
  if (task.category_name) {
    meta.unshift(`<span><span class="dot" style="background:${task.category_color}"></span>${escapeHtml(task.category_name)}</span>`);
  }
  if (task.subtask_total) {
    meta.push(`<span>${ICONS.steps}${task.subtask_done}/${task.subtask_total} steps</span>`);
  }

  return `
    <li class="task-row deadline-row ${task.completed ? 'is-done' : ''}" data-id="${task.id}">
      <div class="task-main">
        <div class="deadline-top">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <span class="countdown ${level}" data-due="${task.completed ? '' : task.due_date}">${countdown}</span>
        </div>
        <div class="task-meta">${meta.join('')}</div>
        ${task.completed ? '' : `
          <div class="progress progress-thin" title="${used}% of the time until the deadline has passed">
            <div class="${level || (used >= 75 ? 'soon' : '')}" style="width:${used}%"></div>
          </div>`}
      </div>
      ${menuButtonHtml()}
    </li>`;
}

async function renderDeadlines() {
  const tasks = await api('/tasks?status=active');
  const withDeadline = tasks
    .filter((t) => t.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const noDeadline = tasks.length - withDeadline.length;

  // Group by how far away the deadline is
  const now = new Date();
  const groups = { Overdue: [], Today: [], Tomorrow: [], 'This week': [], Later: [] };
  for (const task of withDeadline) {
    const due = new Date(task.due_date);
    const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
    if (due < now) groups.Overdue.push(task);
    else if (dayDiff === 0) groups.Today.push(task);
    else if (dayDiff === 1) groups.Tomorrow.push(task);
    else if (dayDiff < 7) groups['This week'].push(task);
    else groups.Later.push(task);
  }

  const next = withDeadline.find((t) => new Date(t.due_date) >= now);

  view().innerHTML = `
    <section class="card next-deadline">
      ${next ? `
        <div>
          <p class="muted small">Next deadline</p>
          <h2>${escapeHtml(next.title)}</h2>
        </div>
        <span class="countdown big ${urgency(next.due_date)}" data-due="${next.due_date}">${timeLeft(next.due_date)}</span>`
      : `<p class="muted">No upcoming deadlines.${groups.Overdue.length ? '' : ' Set a due date on a task to track it here.'}</p>`}
    </section>

    ${Object.entries(groups).map(([name, list]) => list.length ? `
      <div>
        <h2 class="section-title">${name} (${list.length})</h2>
        <ul class="task-list">${list.map(deadlineRowHtml).join('')}</ul>
      </div>` : '').join('')}

    ${noDeadline ? `<p class="muted small">${noDeadline} active task${noDeadline > 1 ? 's have' : ' has'} no deadline. Open a task and set a due date to track it here.</p>` : ''}
  `;

  // Keep every countdown on the page up to date
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    view().querySelectorAll('.countdown[data-due]').forEach((el) => {
      if (!el.dataset.due) return;
      el.textContent = timeLeft(el.dataset.due);
      el.classList.remove('overdue', 'soon');
      const level = urgency(el.dataset.due);
      if (level) el.classList.add(level);
    });
  }, 60000);

  state.refresh = renderDeadlines;
}

/* ==========================================================================
   Task detail panel (right side)
   ========================================================================== */

function closePanel() {
  const panel = $('#panel');
  panel.hidden = true;
  panel.dataset.taskId = '';
  panel.innerHTML = '';
  document.querySelectorAll('.task-row.selected').forEach((row) => row.classList.remove('selected'));
}

async function openTaskPanel(id) {
  const task = id
    ? await api(`/tasks/${id}`)
    : { title: '', description: '', due_date: null, priority: 'medium', category_id: null, subtasks: [] };

  const panel = $('#panel');
  panel.dataset.taskId = id ? String(id) : '';
  document.querySelectorAll('.task-row').forEach((row) => {
    row.classList.toggle('selected', row.dataset.id === String(id));
  });

  panel.innerHTML = `
    <div class="panel-head">
      <h2>${id ? 'Task details' : 'New task'}</h2>
      <button class="icon-btn" id="panel-close" aria-label="Close">${ICONS.close}</button>
    </div>

    <div class="panel-body">
      <form id="task-form" class="form" style="max-width:none">
        <label class="field"><span>Title</span>
          <input name="title" required maxlength="200" value="${escapeHtml(task.title)}">
        </label>
        <label class="field"><span>Description</span>
          <textarea name="description" rows="4" maxlength="2000" placeholder="Add details">${escapeHtml(task.description)}</textarea>
        </label>
        <div class="field-row">
          <label class="field"><span>Due</span>
            <input type="datetime-local" name="due_date" value="${toLocalInput(task.due_date)}">
          </label>
          <label class="field"><span>Priority</span>
            <select name="priority">${optionsHtml([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], task.priority)}</select>
          </label>
        </div>
        <p class="countdown" id="due-countdown"></p>
        <label class="field"><span>Category</span>
          <select name="category_id">
            ${optionsHtml([['', 'No category'], ...state.categories.map((c) => [c.id, c.name])], task.category_id ?? '')}
          </select>
        </label>
      </form>

      <section class="subtasks" id="subtasks">
        ${id ? '' : '<p class="muted small">Save the task first, then you can break it into steps.</p>'}
      </section>
    </div>

    <div class="panel-foot">
      <span class="spacer"></span>
      <button class="btn" type="button" id="task-cancel">Cancel</button>
      <button class="btn btn-primary" type="submit" form="task-form">${id ? 'Save' : 'Create task'}</button>
    </div>
  `;
  panel.hidden = false;

  if (id) renderSubtasks(id, task.subtasks);
  if (!id) $('#task-form [name="title"]').focus();

  // Countdown under the Due field, updated as the date is changed
  const dueInput = $('#task-form [name="due_date"]');
  const showCountdown = () => {
    const el = $('#due-countdown');
    const iso = fromLocalInput(dueInput.value);
    el.hidden = !iso;
    if (!iso) return;
    el.className = `countdown ${task.completed ? 'done' : urgency(iso)}`;
    el.textContent = task.completed ? 'Completed' : timeLeft(iso);
  };
  dueInput.addEventListener('input', showCountdown);
  showCountdown();

  $('#panel-close').addEventListener('click', closePanel);
  $('#task-cancel').addEventListener('click', closePanel);

  $('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const body = {
      title: data.get('title'),
      description: data.get('description'),
      due_date: fromLocalInput(data.get('due_date')),
      priority: data.get('priority'),
      category_id: data.get('category_id') || null,
    };
    safely(async () => {
      if (id) await api(`/tasks/${id}`, { method: 'PATCH', body });
      else await api('/tasks', { method: 'POST', body });
      toast(id ? 'Task saved' : 'Task created');
      closePanel();
      await refresh();
    });
  });
}

function renderSubtasks(taskId, subtasks) {
  const container = $('#subtasks');
  const done = subtasks.filter((s) => s.completed).length;

  container.innerHTML = `
    <h3>Steps ${subtasks.length ? `<span class="muted">${done}/${subtasks.length}</span>` : ''}</h3>
    <ul class="subtask-list">
      ${subtasks.map((s) => `
        <li class="subtask ${s.completed ? 'is-done' : ''}" data-id="${s.id}">
          <button class="check check-sm ${s.completed ? 'checked' : ''}" data-action="toggle-step"
            aria-label="${s.completed ? 'Mark step as not done' : 'Mark step as done'}">${ICONS.check}</button>
          <span>${escapeHtml(s.title)}</span>
          <button class="icon-btn danger" data-action="delete-step" aria-label="Delete step">${ICONS.trash}</button>
        </li>`).join('')}
    </ul>
    <form class="subtask-add" id="subtask-form">
      <input placeholder="Add a step" maxlength="200" aria-label="New step">
      <button class="btn" type="submit">Add</button>
    </form>
  `;

  // Re-fetch the task so the step list and the task row stay in sync
  const reload = async () => {
    const task = await api(`/tasks/${taskId}`);
    renderSubtasks(taskId, task.subtasks);
    await refresh();
  };

  container.querySelector('#subtask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const title = input.value.trim();
    if (!title) return;
    safely(async () => {
      await api(`/tasks/${taskId}/subtasks`, { method: 'POST', body: { title } });
      await reload();
      $('#subtask-form input').focus();
    });
  });

  container.querySelector('.subtask-list').addEventListener('click', (e) => {
    const item = e.target.closest('.subtask');
    if (!item) return;
    const subtaskId = item.dataset.id;

    if (e.target.closest('[data-action="toggle-step"]')) {
      const completed = !item.classList.contains('is-done');
      safely(async () => {
        await api(`/subtasks/${subtaskId}`, { method: 'PATCH', body: { completed } });
        await reload();
      });
    } else if (e.target.closest('[data-action="delete-step"]')) {
      const stepTitle = item.querySelector('span').textContent;
      if (!confirm(`Delete the step "${stepTitle}"?`)) return;
      safely(async () => {
        await api(`/subtasks/${subtaskId}`, { method: 'DELETE' });
        await reload();
      });
    }
  });
}

/* ==========================================================================
   Categories
   ========================================================================== */

function categoryRowHtml(category) {
  return `
    <li class="cat-row" data-id="${category.id}">
      <span class="dot" style="background:${category.color}"></span>
      <span class="cat-name">${escapeHtml(category.name)}</span>
      <span class="muted small">${category.active_count} active</span>
      <button class="btn btn-ghost" data-action="edit">Edit</button>
      <button class="icon-btn danger" data-action="delete" aria-label="Delete ${escapeHtml(category.name)}">${ICONS.trash}</button>
    </li>`;
}

async function renderCategories() {
  await loadCategories();

  view().innerHTML = `
    <section class="card">
      <h2 class="card-title">New category</h2>
      <form id="category-form" class="inline-form">
        <input name="name" placeholder="Category name" maxlength="50" required aria-label="Category name">
        ${colorPickerHtml('color', CATEGORY_COLORS[0])}
        <button class="btn btn-primary" type="submit">Add</button>
      </form>
    </section>

    <section class="card">
      <h2 class="card-title">Your categories</h2>
      ${state.categories.length
        ? `<ul class="cat-list" id="category-list">${state.categories.map(categoryRowHtml).join('')}</ul>`
        : '<p class="muted">No categories yet.</p>'}
    </section>
  `;

  $('#category-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    safely(async () => {
      await api('/categories', { method: 'POST', body: { name: data.get('name'), color: data.get('color') } });
      toast('Category added');
      await renderCategories();
    });
  });

  const list = $('#category-list');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.cat-row');
    if (!row) return;
    const category = state.categories.find((c) => String(c.id) === row.dataset.id);

    if (e.target.closest('[data-action="edit"]')) {
      row.innerHTML = `
        <form class="inline-form">
          <input name="name" value="${escapeHtml(category.name)}" maxlength="50" required aria-label="Category name">
          ${colorPickerHtml(`color-${category.id}`, category.color)}
          <button class="btn btn-primary" type="submit">Save</button>
          <button class="btn" type="button" data-action="cancel">Cancel</button>
        </form>`;
      const form = row.querySelector('form');
      form.querySelector('input').focus();
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const data = new FormData(form);
        safely(async () => {
          await api(`/categories/${category.id}`, {
            method: 'PATCH',
            body: { name: data.get('name'), color: data.get(`color-${category.id}`) },
          });
          toast('Category saved');
          await renderCategories();
        });
      });
    } else if (e.target.closest('[data-action="cancel"]')) {
      row.outerHTML = categoryRowHtml(category);
    } else if (e.target.closest('[data-action="delete"]')) {
      if (!confirm(`Delete "${category.name}"? Its tasks will be kept without a category.`)) return;
      safely(async () => {
        await api(`/categories/${category.id}`, { method: 'DELETE' });
        toast('Category deleted');
        await renderCategories();
      });
    }
  });
}

/* ==========================================================================
   Profile
   ========================================================================== */

function renderProfile() {
  const user = state.user;
  const memberSince = new Date(user.created_at).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });

  view().innerHTML = `
    <section class="card profile-head">
      <span class="avatar avatar-lg">${escapeHtml(initials(user.name))}</span>
      <div>
        <h2>${escapeHtml(user.name)}</h2>
        <p class="muted">${escapeHtml(user.email)}</p>
        <p class="muted small">Member since ${memberSince}</p>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">Personal information</h2>
      <form id="profile-form" class="form">
        <label class="field"><span>Display name</span>
          <input name="name" required maxlength="100" autocomplete="name" value="${escapeHtml(user.name)}">
        </label>
        <label class="field"><span>Email</span>
          <input type="email" name="email" required autocomplete="email" value="${escapeHtml(user.email)}">
        </label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Save changes</button></div>
      </form>
    </section>

    <section class="card">
      <h2 class="card-title">Change password</h2>
      <form id="password-form" class="form">
        <label class="field"><span>Current password</span>
          <input type="password" name="currentPassword" required autocomplete="current-password">
        </label>
        <label class="field"><span>New password</span>
          <input type="password" name="newPassword" required minlength="8" autocomplete="new-password">
        </label>
        <label class="field"><span>Confirm new password</span>
          <input type="password" name="confirmPassword" required minlength="8" autocomplete="new-password">
        </label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Update password</button></div>
      </form>
    </section>
  `;

  $('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    safely(async () => {
      state.user = await api('/profile', { method: 'PATCH', body: { name: data.get('name'), email: data.get('email') } });
      updateRailAvatar();
      toast('Profile updated');
      renderProfile();
    });
  });

  $('#password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    if (data.get('newPassword') !== data.get('confirmPassword')) {
      toast('New passwords do not match', true);
      return;
    }
    safely(async () => {
      await api('/profile/password', {
        method: 'PUT',
        body: { currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') },
      });
      form.reset();
      toast('Password updated');
    });
  });

  state.refresh = null;
}

/* ==========================================================================
   Settings
   ========================================================================== */

async function renderSettings() {
  const settings = await api('/settings');

  view().innerHTML = `
    <section class="card">
      <h2 class="card-title">Appearance</h2>
      <div class="setting-row">
        <div><strong>Use system setting</strong><p class="muted small">Match your device's light or dark mode.</p></div>
        <label class="switch"><input type="checkbox" id="theme-system" aria-label="Use system setting"><span></span></label>
      </div>
      <div class="setting-row sub-setting" id="dark-row">
        <div><strong>Dark mode</strong><p class="muted small" id="dark-hint"></p></div>
        <label class="switch"><input type="checkbox" id="theme-dark" aria-label="Dark mode"><span></span></label>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">Account</h2>
      <div class="setting-row">
        <div><strong>Sign out</strong><p class="muted small">Sign out of TaskFlow on this device.</p></div>
        <button class="btn" id="logout-btn">Sign out</button>
      </div>
      <div class="setting-row">
        <div><strong class="text-danger">Delete account</strong><p class="muted small">Permanently delete your account and all your tasks.</p></div>
        <button class="btn btn-danger-outline" id="delete-account-btn">Delete account</button>
      </div>
      <form id="delete-form" class="delete-form" hidden>
        <label class="field"><span>Enter your password to confirm</span>
          <input type="password" name="password" required autocomplete="current-password">
        </label>
        <div class="form-actions" style="justify-content:flex-start">
          <button class="btn btn-danger" type="submit">Delete my account</button>
          <button class="btn" type="button" id="delete-cancel">Cancel</button>
        </div>
      </form>
    </section>
  `;

  // Settings save as soon as they change
  const save = (patch) => safely(async () => {
    const updated = await api('/settings', { method: 'PATCH', body: patch });
    Object.assign(state.user, updated);
    toast('Settings saved');
  });

  // Two toggles store one setting: theme = 'system', 'light' or 'dark'.
  // "Dark mode" can only be changed when "Use system setting" is off.
  const systemToggle = $('#theme-system');
  const darkToggle = $('#theme-dark');
  const deviceIsDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

  const showTheme = (theme) => {
    const isSystem = theme === 'system';
    systemToggle.checked = isSystem;
    darkToggle.checked = isSystem ? deviceIsDark() : theme === 'dark';
    darkToggle.disabled = isSystem;
    $('#dark-row').classList.toggle('is-disabled', isSystem);
    $('#dark-hint').textContent = isSystem ? 'Turn off "Use system setting" to choose.' : 'Use a dark background.';
  };

  const setTheme = (theme) => {
    applyTheme(theme);
    showTheme(theme);
    save({ theme });
  };

  showTheme(settings.theme);

  // Turning "system" off keeps whatever the device is showing now, so the page doesn't flash
  systemToggle.addEventListener('change', () => {
    setTheme(systemToggle.checked ? 'system' : deviceIsDark() ? 'dark' : 'light');
  });
  darkToggle.addEventListener('change', () => setTheme(darkToggle.checked ? 'dark' : 'light'));

  $('#logout-btn').addEventListener('click', () => safely(async () => {
    await api('/auth/logout', { method: 'POST' });
    location.href = '/login';
  }));

  const deleteForm = $('#delete-form');
  $('#delete-account-btn').addEventListener('click', () => {
    deleteForm.hidden = false;
    deleteForm.querySelector('input').focus();
  });
  $('#delete-cancel').addEventListener('click', () => {
    deleteForm.hidden = true;
    deleteForm.reset();
  });
  deleteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = new FormData(deleteForm).get('password');
    safely(async () => {
      await api('/profile', { method: 'DELETE', body: { password } });
      try { localStorage.removeItem('theme'); } catch (err) { /* storage blocked */ }
      location.href = '/login';
    });
  });

  state.refresh = null;
}
