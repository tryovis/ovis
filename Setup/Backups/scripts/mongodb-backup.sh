#!/usr/bin/env bash
set -euo pipefail

LOG_TS_FORMAT="%Y-%m-%dT%H:%M:%S%z"

MONGO_HOST=${MONGO_HOST:-ovis-backend-database-mongodb}
MONGO_BACKUP_DBS=${MONGO_BACKUP_DBS:-onc_test}
MONGO_BACKUP_COLLECTIONS=${MONGO_BACKUP_COLLECTIONS:-user}
MONGO_BACKUP_RETENTION=${MONGO_BACKUP_RETENTION:-0}
BACKUP_INTERVAL_SECONDS=${BACKUP_INTERVAL_SECONDS:-21600}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/mongodb}

declare -a DBS
declare -a COLLECTIONS
declare -a ALLOWED_COLLECTION_FILES

log() {
  printf '[%s] %s\n' "$(date +"${LOG_TS_FORMAT}")" "$*"
}

trim() {
  local var="$1"
  var="${var#${var%%[![:space:]]*}}"
  var="${var%${var##*[![:space:]]}}"
  printf '%s' "$var"
}

if command -v mongosh >/dev/null 2>&1; then
  MONGO_SHELL=(mongosh --quiet --host "$MONGO_HOST")
elif command -v mongo >/dev/null 2>&1; then
  MONGO_SHELL=(mongo --quiet --host "$MONGO_HOST")
else
  log "No Mongo shell (mongosh or mongo) available in PATH"
  exit 1
fi

wait_for_mongo() {
  log "Waiting for MongoDB at $MONGO_HOST"
  until "${MONGO_SHELL[@]}" --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
    log "MongoDB not ready - retrying in 2s"
    sleep 2
  done
  log "MongoDB is reachable"
}

sanitize_dir() {
  local snapshot_dir="$1"
  for db_path in "$snapshot_dir"/*; do
    [[ -d "$db_path" ]] || continue
    local db_name
    db_name="${db_path##*/}"
    local keep_db=false
    for approved_db in "${DBS[@]}"; do
      if [[ "$approved_db" == "$db_name" ]]; then
        keep_db=true
        break
      fi
    done
    if [[ "$keep_db" == false ]]; then
      log "Removing unexpected database dump: $db_name"
      rm -rf "$db_path"
      continue
    fi
    for entry in "$db_path"/*; do
      [[ -e "$entry" ]] || continue
      local base="${entry##*/}"
      local allowed=false
      for allowed_file in "${ALLOWED_COLLECTION_FILES[@]}"; do
        if [[ "$base" == "$allowed_file" ]]; then
          allowed=true
          break
        fi
      done
      if [[ "$allowed" == false ]]; then
        log "Removing unexpected file from snapshot ($db_name): $base"
        rm -f "$entry"
      fi
    done
  done
}

prune_old() {
  local retention="$1"
  (( retention > 0 )) || return
  mapfile -t snapshots < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %P\n' | sort -rn | awk '{print $2}')
  local total="${#snapshots[@]}"
  if (( total <= retention )); then
    return
  fi
  for (( idx=retention; idx<total; idx++ )); do
    local victim="${snapshots[idx]}"
    [[ -n "$victim" ]] || continue
    log "Pruning old snapshot: $victim"
    rm -rf "$BACKUP_ROOT/$victim"
  done
}

perform_backup() {
  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local snapshot_dir="$BACKUP_ROOT/$timestamp"
  mkdir -p "$snapshot_dir"

  for db in "${DBS[@]}"; do
    for collection in "${COLLECTIONS[@]}"; do
      log "Dumping ${db}.${collection}"
      if ! mongodump --host "$MONGO_HOST" --db "$db" --collection "$collection" --out "$snapshot_dir" >/dev/null 2>&1; then
        log "Failed to dump ${db}.${collection}"
      fi
    done
  done

  sanitize_dir "$snapshot_dir"
  prune_old "$MONGO_BACKUP_RETENTION"
}

main() {
  mkdir -p "$BACKUP_ROOT"

  IFS=',' read -ra __raw_dbs <<< "$MONGO_BACKUP_DBS"
  DBS=()
  for entry in "${__raw_dbs[@]}"; do
    local cleaned
    cleaned=$(trim "$entry")
    if [[ -n "$cleaned" ]]; then
      DBS+=("$cleaned")
    fi
  done

  IFS=',' read -ra __raw_collections <<< "$MONGO_BACKUP_COLLECTIONS"
  COLLECTIONS=()
  for entry in "${__raw_collections[@]}"; do
    local cleaned
    cleaned=$(trim "$entry")
    if [[ -n "$cleaned" ]]; then
      COLLECTIONS+=("$cleaned")
    fi
  done

  if [[ ${#DBS[@]} -eq 0 ]]; then
    log "No databases configured for backup; exiting"
    exit 1
  fi

  if [[ ${#COLLECTIONS[@]} -eq 0 ]]; then
    log "No collections configured for backup; exiting"
    exit 1
  fi

  ALLOWED_COLLECTION_FILES=()
  for collection in "${COLLECTIONS[@]}"; do
    ALLOWED_COLLECTION_FILES+=("${collection}.bson" "${collection}.metadata.json")
  done

  wait_for_mongo

  while true; do
    perform_backup
    log "Sleeping for ${BACKUP_INTERVAL_SECONDS}s"
    sleep "$BACKUP_INTERVAL_SECONDS"
  done
}

trap 'log "Termination signal received"; exit 0' SIGTERM SIGINT

main "$@"
