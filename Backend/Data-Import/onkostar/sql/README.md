Data import requires a set of SQL files. These files are available only to users with a valid ONCOstar license and must be stored in this folder.

## Würzburg tumorboard columns

Set `wuerzburgTBExtension=true` in the deployment `.env` to select
`tumorBoardWuerzburg.sql` and show its ten additional columns in the tumorboard
table. Compose forwards this same setting to the frontend at runtime as
`PUBLIC_WUERZBURG_TB_EXTENSION`; no second setting is needed. The default is
`false`, which selects the standard SQL and hides the additional columns.

The extra fields cover referrer, human genetics consultation, pathology report,
therapy proposals, rationale, molecular analysis, NCT-MASTER, targeting, remarks
and molecular counseling. They extend the existing UKW events. Standard events
have null extension fields; the existing event selection and combined
`recommendation` text are preserved.

Deploy the updated importer, Apollo backend and frontend together. Recreate the
frontend after changing the flag and rerun the tumorboard import and preprocessing
to populate the new fields in existing installations.

Run `python tumorboard_sql_test.py` from the importer directory to check synthetic
standard/UKW events and field mappings. The check uses SQLite with MySQL scalar
helpers and adapts ordered `GROUP_CONCAT`; it does not validate a live MariaDB
import. The frontend query/flag contract can be checked from `Frontend` with
`node --test src/graphQl/gql-tumorboard.test.mjs` (backend dependencies required).

## Patient vital date

`patient.sql` includes `patient.letzte_information` as an additional candidate for
the last vital date. It uses the latest value across rows with the same
`patienten_id` within the configured `ONKOSTAR_PATIENTENSTAEMME`. Demographics
continue to come from the most recently created selected patient row.

When this date is newer than all existing Abschluss and Best-of-Tumor candidates,
or is the only available candidate, the source label is `Am Leben (KIS)`.
Existing sources retain priority on equal dates. A known death date retains its
existing priority over all contact/information dates.

This mapping intentionally treats the KIS information date as a vital-date
candidate for evaluation; the schema alone does not establish whether a site's
KIS supplies a contact date or an administrative update date.

Run `python patient_sql_test.py` from the importer directory for focused synthetic
checks. The test executes the actual SQL using SQLite, ISO date strings and a
MariaDB-compatible `CONCAT` helper; it does not validate a live MariaDB import.
To observe the changed values in OVis, regenerate the Onkostar export and rebuild
the preprocessed collections through the existing import/reset workflow.

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
