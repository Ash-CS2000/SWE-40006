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

## Continuous integration

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on every branch
push, pull requests targeting `main`, and manual runs. It uses Node.js 22 and a
temporary PostgreSQL 16 database on an Ubuntu runner.

### Pipeline stages

1. Install the locked dependencies using `npm ci`.
2. Run `npm test` against the temporary `taskflow_test` database.
3. Build the Docker image with the full source commit SHA as its tag and revision label.
4. Start the image and check that `/health` reports a database connection and the
   expected commit SHA, then check that the login page responds successfully.
5. Publish the tested image to Docker Hub after a successful push to `main`.

A failed step blocks subsequent build, verification, and publication steps.
Container logs and cleanup run even after a failure. Pull requests, pushes to
other branches, and manual runs perform validation only.

### Test requirements

Define an `npm test` script in `package.json` that runs the unit and PostgreSQL
integration tests. The test suite must use the supplied `DATABASE_URL`,
initialize its schema as needed, close database connections when finished, and
exit with a nonzero status when a test fails.

The current project has no `test` script, so CI will fail at that step until
the suite is added. The workflow also supplies `SESSION_SECRET` and
`APP_VERSION`. Its temporary database is created for each job.

The container checks verify startup, database connectivity, source version, and
the login page. Add functional smoke checks before publication when available.

### Configure Docker Hub and GitHub

1. Use the Docker Hub repository `khantthuaung/taskflow` and confirm its visibility is **Private**.
2. Create a Docker Hub access token with **Read & Write** permission for an
   account that can push to the repository.
3. Open the GitHub repository's **Settings → Secrets and variables → Actions**.
4. Add the following repository variables under **Variables** and the token under
   **Secrets**.

| Type | Name | Value |
|---|---|---|
| Variable | `DOCKERHUB_IMAGE` | `khantthuaung/taskflow` |
| Variable | `DOCKERHUB_USERNAME` | `khantthuaung` |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub access token with Read & Write permission |

Set repository visibility to private in Docker Hub. Keep the access token in
GitHub Actions secrets.

### Run and review CI

1. Commit and push your changes to a feature branch.
2. Open the repository's **Actions** tab and select **TaskFlow CI**.
3. Review each step's output. Fix failed tests or container checks and push again.
4. Open a pull request targeting `main` and review its CI result.
5. Merge the reviewed, passing changes into `main`. The resulting push runs the
   pipeline again and publishes the image if every required step succeeds.

To start a manual validation run, select **Run workflow** in the Actions tab once
the workflow is available on the default branch. Manual runs do not publish images.

### Verify the published image

Find the image in the private Docker Hub repository and confirm that its tag
matches the full commit SHA from the successful push run.

```text
khantthuaung/taskflow:<full-commit-sha>
```

Deployment should use this exact image reference and depend on successful
publication. The default Ubuntu runner builds a Linux AMD64 image, so the
deployment host must support that architecture. Set `APP_VERSION` to the same
commit SHA when starting the deployed container.

Retain the Actions run, Docker Hub tag, and health response as release evidence.
To verify that tests block publication, use a controlled, team-approved test on
a publish-eligible push and confirm that a failed test skips publication.
A failed pull request run alone does not establish this, because pull requests
are excluded from publication by the workflow condition.
