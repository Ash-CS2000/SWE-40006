#!/usr/bin/env bash
# One-time setup of the staging environment on the EC2 instance.
# Creates a separate network, database volume, PostgreSQL container and config
# under /opt/taskflow-staging, so staging can never touch production data.
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo "Run as root: sudo -i, then bash this file."; exit 1; }

CONFIG_DIR=/opt/taskflow-staging
NETWORK=taskflow-staging-network
VOLUME=taskflow-staging-pgdata
DB_CONTAINER=taskflow-staging-db

# New installations only: keep existing staging credentials and data.
for config in "$CONFIG_DIR/db.env" "$CONFIG_DIR/app.env"; do
  [[ ! -e "$config" ]] || { echo "Existing $config; staging is already set up."; exit 1; }
done
if docker volume inspect "$VOLUME" >/dev/null 2>&1 || \
   docker container inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo 'An existing staging database/volume was found. Setup stopped.'
  exit 1
fi

install -d -m 700 "$CONFIG_DIR"
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  docker network create "$NETWORK"
fi
docker volume create "$VOLUME"

# Staging gets its own passwords, different from production.
DB_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 48)
umask 077

printf 'POSTGRES_USER=taskflow\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=todo_app_staging\n' \
  "$DB_PASSWORD" > "$CONFIG_DIR/db.env"

printf 'NODE_ENV=production\nPORT=3000\nDATABASE_URL=postgres://taskflow:%s@%s:5432/todo_app_staging\nSESSION_SECRET=%s\n' \
  "$DB_PASSWORD" "$DB_CONTAINER" "$SESSION_SECRET" > "$CONFIG_DIR/app.env"

unset DB_PASSWORD SESSION_SECRET

docker run -d \
  --name "$DB_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$CONFIG_DIR/db.env" \
  --log-opt max-size=10m --log-opt max-file=3 \
  -v "$VOLUME":/var/lib/postgresql/data \
  postgres:16

for attempt in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U taskflow -d todo_app_staging; then
    echo 'Staging PostgreSQL is ready.'
    exit 0
  fi
  sleep 2
done
echo 'Staging PostgreSQL did not become ready.'
docker logs --tail 80 "$DB_CONTAINER"
exit 1
