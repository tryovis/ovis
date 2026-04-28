#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec env OVIS_PUBLISH_TARGET=general "$ROOT/scripts/push-verbis-images.sh" "$@"
