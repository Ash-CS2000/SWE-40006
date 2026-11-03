# TaskFlow

Task management web app for SWE40006 (Group 8). Node.js + Express + PostgreSQL, with a plain HTML/CSS/JS frontend served by the same server.

## Features

- Sign up / sign in (passwords hashed with bcrypt, sessions stored in PostgreSQL)
- Tasks: create, view, edit, complete, delete
- Each task has a ⋮ menu: Edit, Mark as complete (with Undo), Delete (asks to confirm)
- Due dates, priority (low / medium / high), categories, and subtasks ("steps")
- Smart sorting: overdue first, then by priority, then by due date
- Search, and filter by category and priority
- Completed tasks move to a collapsible Completed section
- Home page with stats: active, due today, overdue, done this week, completion rate
- Deadlines page: live countdowns and a time-used bar, grouped as overdue / today / tomorrow / this week / later
- Profile: change name, email, and password
- Settings: follow the device theme, or choose light / dark; sign out; delete account

## Run locally

Requires Node.js 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env      # then edit DATABASE_URL and SESSION_SECRET
createdb todo_app         # or create the database another way
npm start                 # http://localhost:3000
```

No PostgreSQL installed? Start one in Docker instead of `createdb`. It matches the default `DATABASE_URL` in `.env.example`:

```bash
docker run -d --name todo-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=todo_app \
  postgres:16
```

`npm run dev` restarts the server automatically when files change.

The tables are created automatically on startup (`src/schema.sql` uses `CREATE TABLE IF NOT EXISTS`), so a new empty database just works and existing data is never wiped.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | `postgres://USER:PASSWORD@HOST:5432/DATABASE` |
| `SESSION_SECRET` | Yes in production | Long random string used to sign login cookies |
| `PORT` | No | Default `3000` |
| `APP_VERSION` | No | Shown by `/health`, e.g. the Git commit SHA |

## Docker

The `Dockerfile` packages the app (Node.js 22, production dependencies only, runs as a non-root user). The database is **not** inside the image; pass its address with `DATABASE_URL`.

```bash
docker build -t taskflow:<commit-sha> .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/todo_app \
  -e SESSION_SECRET=<random string> \
  -e APP_VERSION=<commit-sha> \
  taskflow:<commit-sha>
```

- `.dockerignore` keeps `.env`, `node_modules` and `.git` out of the image.
- The image has a built-in `HEALTHCHECK` that calls `/health` every 30 seconds (`docker ps` shows `healthy` / `unhealthy`).
- Inside a container, `localhost` means the container itself. If PostgreSQL runs in another container, use that container's name as the host in `DATABASE_URL`.

## Notes for deployment

- **Health check:** `GET /health` returns `200 {"status":"ok","database":"connected","version":"..."}` when the app can reach PostgreSQL, and `503` when it can't. It needs no login.
- **Startup:** `npm start` (runs `node src/server.js`). If the database isn't ready yet, the app retries the connection 10 times, 3 seconds apart.
- **Data persistence:** all data (users, tasks, sessions) lives in PostgreSQL. Redeploying the app container doesn't lose data as long as the database is kept.
- **Testing:** there are **no automated tests yet**, and no `npm test` script. `src/app.js` exports the Express app without starting the server, so tests can import it (e.g. with Supertest). Validation logic in `src/utils/validation.js` is made of pure functions for unit tests. Integration tests should call `initDb()` from `src/db.js` first to create the tables, and `pool.end()` at the end so the test run can exit.

## Project structure

```
Dockerfile             how to package the app into an image
.dockerignore          files kept out of the image (.env, node_modules, .git)
.env.example           template for the .env settings file
package.json           dependencies and npm scripts
src/
  server.js            sets up the database, then starts the server
  app.js               Express app: middleware, routes, /health
  db.js                PostgreSQL connection pool + schema setup
  schema.sql           tables: users, categories, tasks, subtasks
  middleware/auth.js   blocks API calls from signed-out users
  routes/              auth, tasks, subtasks, categories, profile, settings, stats
  utils/               validation helpers, user queries
public/
  index.html, login.html
  css/styles.css
  js/api.js, js/app.js, js/login.js
```

## API

All `/api` routes require a signed-in session, except register, login and logout. `/health` is public.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current user |
| GET | `/api/tasks?status=&category=&priority=&q=` | List tasks |
| POST | `/api/tasks` | Create task |
| GET / PATCH / DELETE | `/api/tasks/:id` | Get / update / delete task |
| POST | `/api/tasks/:id/subtasks` | Add step |
| PATCH / DELETE | `/api/subtasks/:id` | Update / delete step |
| GET / POST | `/api/categories` | List / create categories |
| PATCH / DELETE | `/api/categories/:id` | Update / delete category |
| GET / PATCH / DELETE | `/api/profile` | Get / update / delete account |
| PUT | `/api/profile/password` | Change password |
| GET / PATCH | `/api/settings` | Get / update theme |
| GET | `/api/stats` | Home page numbers |
| GET | `/health` | Health check |
