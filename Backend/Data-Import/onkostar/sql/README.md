Data import requires a set of SQL files. These files are available only to users with a valid ONCOstar license and must be stored in this folder.

## Nuclear medicine and other therapies

`therapy.sql` imports these as `generalType = nuclear` and `generalType = other`.
Common therapy fields (dates, intention, status, department, treatment setting,
termination reason and linked procedures) retain their existing mappings.

| Output field | Nuclear medicine (`dk_nuklearmedtherapie`) | Other (`dk_sonstigetherapie`) |
| --- | --- | --- |
| `subType`, `subTypeCode` | `therapieart` | `art` |
| `subTypeDetail`, `subTypeDetailCode` | `sonstigetherapieart`, only when `therapieart = M` | `arterweitert`, only when `art = A` |
| `radioNuclid`, `radioNuclidCode` | `radionuklid` | null |
| `radiopharmaceutical`, `radiopharmaceuticalCode` | `radiopharmakon` | null |

Each label is resolved through `property_catalogue_version_entry` using both the
source code and its corresponding `*_propcat_version`. Missing, null or blank
labels fall back to the trimmed source code; unanswered values remain null.
The separate `*Code` fields preserve the source codes. Additional fields are null
for the four other therapy types. Detail fields follow Onkostar's conditional
visibility so values left over from a different therapy type are not presented.

Nuclear medicine uses `therapieart` (for example MPRRT or MPSMA), not the separate
`adtapplikationsart` reporting field. `radioNuclid` deliberately matches the existing
OVis radiation field spelling. The optional radiopharmaceutical is distinct from
the radionuclide, for example DOTA-TATE versus Lu-177.

After deploying these changes, rerun the Onkostar therapy import and preprocessing
to populate new fields and correct existing nuclear therapy labels. An application
deployment alone does not rewrite previously imported records.

Focused checks, run from `Backend/Data-Import/onkostar`:

```sh
node --test sqlStatements.test.mjs
python therapy_sql_test.py
```

The Python check uses only the standard library and synthetic in-memory fixtures.
It executes the actual nuclear/other SELECT branches, verifies versioned labels,
code fallbacks, conditional details and common fields, and checks projection order
across all six UNION branches. It does not connect to a live Onkostar database or
validate MariaDB-specific aggregation expressions elsewhere in the query.
