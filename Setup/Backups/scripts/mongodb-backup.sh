#!/usr/bin/env bash
set -euo pipefail

LOG_TS_FORMAT="%Y-%m-%dT%H:%M:%S%z"

MONGO_HOST=${MONGO_HOST:-ovis-backend-database-mongodb}
MONGO_BACKUP_DBS=${MONGO_BACKUP_DBS:-onc_test}
MONGO_BACKUP_COLLECTIONS=${MONGO_BACKUP_COLLECTIONS:-user,platformConfiguration,platformDocument}
MONGO_BACKUP_REQUIRED_COLLECTIONS=${MONGO_BACKUP_REQUIRED_COLLECTIONS:-usageEvent,platformConfiguration,platformDocument}
# Site configuration may add collections, but cannot omit persistent application state.
PROTECTED_COLLECTIONS=user,usageEvent,platformConfiguration,platformDocument
MONGO_BACKUP_RETENTION=${MONGO_BACKUP_RETENTION:-0}
BACKUP_INTERVAL_SECONDS=${BACKUP_INTERVAL_SECONDS:-21600}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/mongodb}
SHUTDOWN_REQUESTED=false
SLEEP_PID=''

declare -a DBS
declare -a COLLECTIONS
declare -a ALLOWED_COLLECTION_FILES

log() {
  printf '[%s] %s\n' "$(date +"${LOG_TS_FORMAT}")" "$*"
}

request_shutdown() {
  SHUTDOWN_REQUESTED=true
  if [[ -n "$SLEEP_PID" ]]; then
    kill "$SLEEP_PID" 2>/dev/null || true
  fi
}

interruptible_sleep() {
  sleep "$1" &
  SLEEP_PID=$!
  # Waiting on a child lets Bash handle SIGTERM immediately, even for long intervals.
  if [[ $SHUTDOWN_REQUESTED == true ]]; then
    kill "$SLEEP_PID" 2>/dev/null || true
  fi
  wait "$SLEEP_PID" || true
  SLEEP_PID=''
}

trim() {
  local var="$1"
  var="${var#${var%%[![:space:]]*}}"
  var="${var%${var##*[![:space:]]}}"
  printf '%s' "$var"
}

append_collection_once() {
  local value="$1"
  local existing
  for existing in "${COLLECTIONS[@]}"; do
    if [[ "$existing" == "$value" ]]; then
      return
    fi
  done
  COLLECTIONS+=("$value")
}

json_quote() {
  local str="$1"
  str=${str//\\/\\\\}
  str=${str//\"/\\\"}
  printf '"%s"' "$str"
}

collection_is_absent() {
  local db_literal
  local collection_literal
  local raw
  db_literal=$(json_quote "$1")
  collection_literal=$(json_quote "$2")
  # Old databases may not have used the new platform settings yet. Only an
  # explicitly confirmed missing namespace may be skipped after a dump failure.
  if ! raw=$("${MONGO_SHELL[@]}" --eval "print(db.getSiblingDB($db_literal).getCollectionInfos({name: $collection_literal}).length)"); then
    return 1
  fi
  [[ $(trim "$raw") == 0 ]]
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
    if [[ $SHUTDOWN_REQUESTED == true ]]; then
      log "MongoDB unavailable during shutdown; no final snapshot could be saved"
      return 1
    fi
    log "MongoDB not ready - retrying in 2s"
    interruptible_sleep 2
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
      rm -rf "$db_path" || return 1
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
        rm -f "$entry" || return 1
      fi
    done
  done
}

prune_old() {
  local retention="$1"
  (( retention > 0 )) || return 0
  mapfile -t snapshots < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%T@ %P\n' | sort -rn | awk '{print $2}')
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
  timestamp="$(date -u +%Y%m%d-%H%M%S-%N)"
  local snapshot_dir
  snapshot_dir=$(mktemp -d "$BACKUP_ROOT/.pending-${timestamp}.XXXXXX") || return 1

  for db in "${DBS[@]}"; do
    for collection in "${COLLECTIONS[@]}"; do
      log "Dumping ${db}.${collection}"
      if ! mongodump --host "$MONGO_HOST" --db "$db" --collection "$collection" --out "$snapshot_dir" >/dev/null 2>&1; then
        if collection_is_absent "$db" "$collection"; then
          log "Collection ${db}.${collection} does not exist yet; skipping"
          rm -f "$snapshot_dir/$db/${collection}.bson" "$snapshot_dir/$db/${collection}.metadata.json" || return 1
        else
          log "Failed to dump ${db}.${collection}; retaining previous complete snapshots"
          rm -rf "$snapshot_dir"
          return 1
        fi
      fi
    done
  done

  : > "$snapshot_dir/.ovis-collections" || return 1
  for db in "${DBS[@]}"; do
    for collection in "${COLLECTIONS[@]}"; do
      printf '%s/%s\n' "$db" "$collection" >> "$snapshot_dir/.ovis-collections" || return 1
    done
  done
  if ! sanitize_dir "$snapshot_dir" || ! printf '%s\n' "$timestamp" > "$snapshot_dir/.ovis-complete" || ! mv "$snapshot_dir" "$BACKUP_ROOT/$timestamp"; then
    log "Failed to publish snapshot $timestamp; retaining previous complete snapshots"
    return 1
  fi
  log "MongoDB backup completed: $timestamp"
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

  IFS=',' read -ra __raw_collections <<< "$MONGO_BACKUP_COLLECTIONS,$MONGO_BACKUP_REQUIRED_COLLECTIONS,$PROTECTED_COLLECTIONS"
  COLLECTIONS=()
  for entry in "${__raw_collections[@]}"; do
    local cleaned
    cleaned=$(trim "$entry")
    if [[ -n "$cleaned" ]]; then
      append_collection_once "$cleaned"
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

  while [[ $SHUTDOWN_REQUESTED == false ]]; do
    if ! perform_backup; then
      log "Backup failed; the next scheduled run will retry"
    fi
    if [[ $SHUTDOWN_REQUESTED == true ]]; then
      break
    fi
    log "Sleeping for ${BACKUP_INTERVAL_SECONDS}s"
    interruptible_sleep "$BACKUP_INTERVAL_SECONDS"
  done

  log "Termination signal received; saving final MongoDB snapshot"
  if ! perform_backup; then
    log "Final MongoDB backup FAILED; inspect the backup logs before removing database volumes"
    return 1
  fi
}

trap request_shutdown SIGTERM SIGINT

main "$@"
