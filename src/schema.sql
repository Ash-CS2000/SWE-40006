-- Database schema for TaskFlow.
-- Every statement uses IF NOT EXISTS, so running this file again on an
-- existing database never deletes data. The app runs it on every startup.

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  theme           VARCHAR(10) NOT NULL DEFAULT 'system'
                    CHECK (theme IN ('light', 'dark', 'system')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id       SERIAL PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name     VARCHAR(50) NOT NULL,
  color    VARCHAR(7) NOT NULL DEFAULT '#5b5fc7',
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title         VARCHAR(200) NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  due_date      TIMESTAMPTZ,
  priority      VARCHAR(10) NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high')),
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subtasks (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  completed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evidence files (PDF or image) attached to a task. The file bytes are stored
-- in the database rather than on disk, because the app container is replaced
-- on every deploy and anything written inside it would be lost.
CREATE TABLE IF NOT EXISTS task_evidence (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename    VARCHAR(200) NOT NULL,
  mime_type   VARCHAR(50) NOT NULL,
  size_bytes  INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_task_evidence_task ON task_evidence(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date) WHERE NOT completed;
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
