# ONKOSTAR importer

## Large JSON exports

The importer serializes each database row separately and writes bounded chunks to
`/shared/out.txt` and `/shared/omock.json.tmp`. The JSON values and top-level
collection arrays are preserved; whitespace is more compact. This avoids creating
one string for an entire collection, which can raise
`RangeError: Invalid string length` for large therapy exports.

Successful collections are logged by name and row count. On failure, the error
names the collection and retains the original cause. The container command exits
with a nonzero status if generation or upload fails. A configured restart policy
may restart the failed container. External `OVIS_OMOCK_FILE` input continues to
skip database generation.

Database queries still return a complete result array in memory. This change fixes
collection-wide JSON string allocation; it does not provide streaming SQL reads
or remove the memory requirements of the importer and preprocessor. A single row
must still fit in a JavaScript string. The separate UTMS exporters retain their
existing serialization behavior.

## Verification

Run from this directory:

```sh
node --test jsonExport.test.mjs containerCommand.test.mjs sqlStatements.test.mjs
python therapy_sql_test.py
```

The JSON regression test generates more characters than the runtime's actual
`buffer.constants.MAX_STRING_LENGTH` without collecting the output in one string
or writing a large file. File tests verify multiple collections, empty results,
Unicode, nulls, UTMS append compatibility, and propagated write/serialization
failures. Container tests execute the Dockerfile command with stubbed generation,
upload and keepalive commands. They require `/bin/sh` or Git for Windows.

These checks use synthetic data. Deployment verification still requires a full
import with the site's database and row counts, followed by successful upload and
preprocessing. SQL mapping checks alone do not validate exporter size limits.

The runtime fix requires `mdbConnect.mjs`, `jsonExport.mjs` and the updated
Dockerfile in a rebuilt ONKOSTAR importer image. Replacing `therapy.sql` alone does
not install the fix.
