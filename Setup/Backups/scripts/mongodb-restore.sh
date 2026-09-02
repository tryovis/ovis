#!/usr/bin/env bash
set -euo pipefail
shopt -s extglob

LOG_TS_FORMAT="%Y-%m-%dT%H:%M:%S%z"

MONGO_HOST=${MONGO_HOST:-ovis-backend-database-mongodb}
MONGO_RESTORE_DBS=${MONGO_RESTORE_DBS:-onc_test}
MONGO_RESTORE_COLLECTIONS=${MONGO_RESTORE_COLLECTIONS:-user}
MONGO_RESTORE_REQUIRED_COLLECTIONS=${MONGO_RESTORE_REQUIRED_COLLECTIONS:-usageEvent}
MONGO_RESTORE_IGNORE_IDS=${MONGO_RESTORE_IGNORE_IDS:-ovis-root}
BACKUP_ROOT=${BACKUP_ROOT:-/backups}
IMPORT_MODE=${OVIS_IMPORT_MODE:-}
MONGO_READY=false

log() {
  printf '[%s] %s\n' "$(date +"${LOG_TS_FORMAT}")" "$*"
}

split_csv() {
  local raw="$1"
  local -n out_ref=$2
  out_ref=()
  IFS=',' read -ra __items <<< "$raw"
  for entry in "${__items[@]}"; do
    local trimmed
    trimmed=${entry##+([[:space:]])}
    trimmed=${trimmed%%+([[:space:]])}
    if [[ -n $trimmed ]]; then
      local already_present=false
      local current
      for current in "${out_ref[@]}"; do
        if [[ "$current" == "$trimmed" ]]; then
          already_present=true
          break
        fi
      done
      if [[ $already_present == false ]]; then
        out_ref+=("$trimmed")
      fi
    fi
  done
}

json_quote() {
  local str="$1"
  str=${str//\\/\\\\}
  str=${str//"/\\"}
  printf '"%s"' "$str"
}

build_ignore_json() {
  if (( ${#IGNORE_IDS[@]} == 0 )); then
    printf '[]'
    return
  fi
  local parts=()
  for id in "${IGNORE_IDS[@]}"; do
    parts+=("$(json_quote "$id")")
  done
  local joined=""
  for quoted in "${parts[@]}"; do
    if [[ -n $joined ]]; then
      joined+=",$quoted"
    else
      joined="$quoted"
    fi
  done
  printf '[%s]' "$joined"
}

select_mongo_shell() {
  if command -v mongosh >/dev/null 2>&1; then
    MONGO_SHELL=(mongosh --quiet --host "$MONGO_HOST")
  elif command -v mongo >/dev/null 2>&1; then
    MONGO_SHELL=(mongo --quiet --host "$MONGO_HOST")
  else
    log "Neither mongosh nor mongo is available on PATH"
    exit 1
  fi
}

wait_for_mongo() {
  log "Waiting for MongoDB at $MONGO_HOST"
  until "${MONGO_SHELL[@]}" --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
    log "MongoDB not ready yet; retrying in 2s"
    sleep 2
  done
  MONGO_READY=true
  log "MongoDB is reachable"
}

ensure_demo_user() {
  if [[ ${IMPORT_MODE^^} != DEMO ]]; then
    return
  fi

  if [[ $MONGO_READY != true ]]; then
    wait_for_mongo
  fi

  read -r -d '' script <<'EOF_JS' || true
const demoUser = {
  _id: "test",
  createdAt: new Date(),
  createdBy: "system",
  role: "user",
  status: "active",
  pseudonymization: false,
  darkMode: false,
  colorTheme: "CCCMunich",
  language: "en"
};
db.getSiblingDB("onc_test").getCollection("user").updateOne(
  {_id: "test"},
  {$setOnInsert: demoUser},
  {upsert: true}
);
db.getSiblingDB("onc_test").getCollection("user").updateOne(
  {_id: "test", createdBy: "system", role: "super-admin"},
  {$set: {role: "user"}}
);
EOF_JS

  "${MONGO_SHELL[@]}" --eval "$script" >/dev/null
  log "Ensured the DEMO user exists in onc_test.user"
}

latest_snapshot() {
  if [[ ! -d "$BACKUP_ROOT" ]]; then
    return 1
  fi
  local latest
  latest=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%P\n' 2>/dev/null | sort | tail -n 1)
  if [[ -z $latest ]]; then
    return 1
  fi
  printf '%s' "$latest"
}

collection_has_data() {
  local db="$1"
  local collection="$2"
  local db_literal
  local col_literal
  local ignore_json
  db_literal=$(json_quote "$db")
  col_literal=$(json_quote "$collection")
  ignore_json=$(build_ignore_json)

  read -r -d '' script <<EOF_JS || true
const dbName = $db_literal;
const collName = $col_literal;
const ignoreIds = $ignore_json;
const filter = ignoreIds.length ? {_id: {\$nin: ignoreIds}} : {};
const count = db.getSiblingDB(dbName).getCollection(collName).countDocuments(filter);
print(count);
EOF_JS

  local raw
  raw=$("${MONGO_SHELL[@]}" --eval "$script" | tail -n 1 | tr -d '[:space:]')
  if [[ $raw =~ ^[0-9]+$ && $raw -gt 0 ]]; then
    log "Detected $raw existing documents in ${db}.${collection}; skipping restore"
    return 0
  fi
  return 1
}

datastore_has_content() {
  for db in "${DBS[@]}"; do
    for collection in "${COLLECTIONS[@]}"; do
      if collection_has_data "$db" "$collection"; then
        return 0
      fi
    done
  done
  return 1
}

restore_snapshot() {
  local snapshot_name="$1"
  local snapshot_path="$BACKUP_ROOT/$snapshot_name"
  local restored=false

  for db in "${DBS[@]}"; do
    for collection in "${COLLECTIONS[@]}"; do
      local bson_file="$snapshot_path/$db/${collection}.bson"
      if [[ -f $bson_file ]]; then
        log "Restoring ${db}.${collection} from snapshot $snapshot_name"
        if ! mongorestore --host "$MONGO_HOST" --drop --db "$db" --collection "$collection" "$bson_file" >/dev/null 2>&1; then
          log "mongorestore failed for ${db}.${collection}"
          return 1
        fi
        restored=true
      else
        log "Snapshot $snapshot_name lacks ${db}.${collection}; skipping"
      fi
    done
  done

  if [[ $restored == true ]]; then
    log "MongoDB restore completed from $snapshot_name"
  else
    log "No matching collections restored from $snapshot_name"
  fi
}

main() {
  split_csv "$MONGO_RESTORE_DBS" DBS
  split_csv "$MONGO_RESTORE_COLLECTIONS,$MONGO_RESTORE_REQUIRED_COLLECTIONS" COLLECTIONS
  split_csv "$MONGO_RESTORE_IGNORE_IDS" IGNORE_IDS

  if [[ ${IMPORT_MODE^^} == DEMO ]]; then
    local filtered_ignore_ids=()
    local ignore_id
    for ignore_id in "${IGNORE_IDS[@]}"; do
      if [[ $ignore_id != test ]]; then
        filtered_ignore_ids+=("$ignore_id")
      fi
    done
    IGNORE_IDS=("${filtered_ignore_ids[@]}")
  fi

  if (( ${#DBS[@]} == 0 || ${#COLLECTIONS[@]} == 0 )); then
    log "No databases or collections configured for restore; exiting"
    if [[ ${IMPORT_MODE^^} == DEMO ]]; then
      select_mongo_shell
      ensure_demo_user
    fi
    exit 0
  fi

  select_mongo_shell

  local snapshot
  if ! snapshot=$(latest_snapshot); then
    log "No MongoDB snapshots present in $BACKUP_ROOT; nothing to restore"
    ensure_demo_user
    exit 0
  fi

  log "Latest MongoDB snapshot detected: $snapshot"
  wait_for_mongo

  if datastore_has_content; then
    log "Target MongoDB already contains data; skipping automatic restore"
    ensure_demo_user
    exit 0
  fi

  restore_snapshot "$snapshot"
  ensure_demo_user
}

trap 'log "Termination signal received"; exit 0' SIGTERM SIGINT

main "$@"
