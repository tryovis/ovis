#!/bin/sh
set -e
echo '=== Starting Keycloak configuration ==='

# Preflight: ensure jq is available in the image
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is not installed. The keycloak-config image should include jq."
  exit 1
fi
echo "jq is present: $(jq --version)"

WAIT_SECONDS="${KEYCLOAK_WAIT_SECONDS:-120}"
POLL_INTERVAL="${KEYCLOAK_WAIT_POLL_INTERVAL:-3}"
READY_URL="${KEYCLOAK_READY_URL:-http://keycloak:8080/keycloak/realms/master/.well-known/openid-configuration}"

echo "Waiting for Keycloak readiness at ${READY_URL} (timeout: ${WAIT_SECONDS}s)..."
elapsed=0
until HTTP_PROXY= HTTPS_PROXY= http_proxy= https_proxy= NO_PROXY= no_proxy= \
  wget -Y off -q -O /dev/null "$READY_URL"; do
  elapsed=$((elapsed + POLL_INTERVAL))
  if [ "$elapsed" -ge "$WAIT_SECONDS" ]; then
    echo "ERROR: Keycloak did not become ready within ${WAIT_SECONDS}s"
    exit 1
  fi
  echo "Keycloak not ready yet (${elapsed}s elapsed); retrying in ${POLL_INTERVAL}s..."
  sleep "$POLL_INTERVAL"
done
echo 'Keycloak readiness check passed.'

echo 'Building dynamic realm configuration...'
mkdir -p /import

echo 'Executing realm build script with line ending protection...'
tr -d '\r' < /build-realm.sh | sh

echo 'Verifying realm file creation...'
if [ ! -f /import/ovis-realm.json ]; then
  echo 'ERROR: Realm file not created - using fallback'
  cp /realm-base/ovis-realm.json /import/ovis-realm.json
fi

SELF_CONTAINER_ID="${HOSTNAME:-}"
COMPOSE_PROJECT=""

if [ -n "$SELF_CONTAINER_ID" ]; then
  COMPOSE_PROJECT=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$SELF_CONTAINER_ID" 2>/dev/null || true)
fi

if [ -n "$COMPOSE_PROJECT" ]; then
  KEYCLOAK_CONTAINER=$(docker ps \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
    --filter "label=com.docker.compose.service=keycloak" \
    --format '{{.ID}}' \
    | head -n1)
else
  KEYCLOAK_CONTAINER=$(docker ps \
    --filter "label=com.docker.compose.service=keycloak" \
    --format '{{.ID}}' \
    | head -n1)
fi

if [ -z "$KEYCLOAK_CONTAINER" ]; then
  echo 'ERROR: Could not find a running Keycloak container via compose labels'
  docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}'
  exit 1
fi

echo "Using Keycloak container: $KEYCLOAK_CONTAINER"

echo 'Copying realm file to Keycloak container...'
docker exec "$KEYCLOAK_CONTAINER" mkdir -p /import
docker cp /import/ovis-realm.json "$KEYCLOAK_CONTAINER":/import/

echo 'Executing import command...'
docker exec "$KEYCLOAK_CONTAINER" ls -lah /import
if ! docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kc.sh import --dir /import --override true; then
  echo 'ERROR: Keycloak import failed. Dumping last 200 lines of server log:'
  docker logs --tail 200 "$KEYCLOAK_CONTAINER" || true
  exit 1
fi

echo 'Restarting Keycloak container...'
docker restart "$KEYCLOAK_CONTAINER"
echo 'Import process completed'
