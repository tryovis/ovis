#!/bin/sh
set -eu

: "${OVIS_PREPROCESSOR_URL:=http://ovis-backend-mongodb-data-preprocessing:9000/omock}"
: "${OVIS_OMOCK_FILE:=/input/omock.json}"
: "${CREDOS_EXPORT_DIR:=/input/CREDOSExportFiles}"
: "${CREDOS_OMOCK_OUTPUT:=/shared/omock.json}"

export OVIS_PREPROCESSOR_URL
export OVIS_OMOCK_FILE
export CREDOS_EXPORT_DIR
export CREDOS_OMOCK_OUTPUT

if [ -f "$OVIS_OMOCK_FILE" ]; then
  echo "Detected external omock.json at $OVIS_OMOCK_FILE; skipping CREDOS generation..."
  export OMOCK_TO_UPLOAD="$OVIS_OMOCK_FILE"
else
  echo "Validating CREDOS export files in $CREDOS_EXPORT_DIR..."
  node credosImportMode.mjs validate "$CREDOS_EXPORT_DIR"

  echo "Generating CREDOS omock.json from source files..."
  node credosImporter.mjs

  export OMOCK_TO_UPLOAD="$CREDOS_OMOCK_OUTPUT"
fi

if [ ! -f "$OMOCK_TO_UPLOAD" ]; then
  echo "ERROR: omock.json to upload not found at $OMOCK_TO_UPLOAD" >&2
  exit 1
fi

echo "Uploading CREDOS omock.json to preprocessing service..."
node upload-omock.mjs

echo "CREDOS data imported (uploaded)"
exec tail -f /dev/null
