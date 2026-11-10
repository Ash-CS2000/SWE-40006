#!/usr/bin/env bash
# Deploys one published image (by commit SHA) to staging and waits until it is healthy.
# Installed on the server as /opt/taskflow-staging/deploy.sh and run by GitHub Actions through SSM.
# Usage: /opt/taskflow-staging/deploy.sh <40-character commit SHA>
set -Eeuo pipefail

REPOSITORY=khantthuaung/taskflow
CONFIG_DIR=/opt/taskflow-staging
NETWORK=taskflow-staging-network
APP_CONTAINER=taskflow-staging-app
PUBLIC_PORT=8080

SHA="${1:?Supply the full 40-character source commit SHA}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid SHA'; exit 1; }
IMAGE="$REPOSITORY:$SHA"

# Separate lock from production, so a staging deploy never blocks a production one.
exec 9>/var/lock/taskflow-staging-deploy.lock
flock -n 9 || { echo 'Another staging deployment is running'; exit 1; }

# Same image that CI tested and published: pull it, never rebuild it.
# A failed pull must leave the running staging app untouched.
docker pull "$IMAGE"
REVISION=$(docker image inspect --format \
  '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")
[[ "$REVISION" == "$SHA" ]] || { echo 'Image revision mismatch'; exit 1; }

if docker container inspect "$APP_CONTAINER" >/dev/null 2>&1; then
  CURRENT=$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER")
  HEALTH=$(docker inspect --format '{{.State.Health.Status}}' "$APP_CONTAINER")
  if [[ "$CURRENT" == "$IMAGE" && "$HEALTH" == healthy ]]; then
    echo "Staging already running healthy: $SHA"
    exit 0
  fi
  docker rm -f "$APP_CONTAINER"
fi

docker run -d \
  --name "$APP_CONTAINER" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --env-file "$CONFIG_DIR/app.env" \
  --env "APP_VERSION=$SHA" \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p "$PUBLIC_PORT":3000 \
  "$IMAGE"

for attempt in $(seq 1 45); do
  if docker exec -e "EXPECTED_VERSION=$SHA" "$APP_CONTAINER" node -e '
    fetch("http://127.0.0.1:3000/health", {signal: AbortSignal.timeout(3000)})
      .then(async r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        const h = await r.json();
        if (h.status !== "ok" || h.database !== "connected" ||
            h.version !== process.env.EXPECTED_VERSION) throw new Error("Health mismatch");
      }).catch(e => { console.error(e.message); process.exit(1); });
  '; then
    echo "Staging deployment verified: $IMAGE"
    curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$PUBLIC_PORT/health"
    echo
    exit 0
  fi
  sleep 2
done

echo 'Staging deployment failed its health/version check'
docker logs --tail 100 "$APP_CONTAINER"
exit 1
