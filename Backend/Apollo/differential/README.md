# OMOCK AST differential simulation

This harness compares two independently computed result sets:

1. The reference evaluator reads the materialized OMOCK documents and evaluates the intended filter semantics in memory.
2. The production `astTranslator` builds the real Mongo aggregation, which is executed against an isolated Mongo database.

The comparison is based on document IDs (including materialized study-patient document IDs), not just counts. A failure therefore reports both missing and unexpected IDs.

## Covered cases

- every scalar, number, date and array field discovered in all materialized collections;
- local and cross-system tumor joins;
- patient-cohort joins, including patients with multiple tumors;
- diagnosis and the separate histology collection;
- materialized study-patient rows and mixed study/patient/tumor filters;
- `AND`, `OR`, `NOR`, and two- and multi-branch `XOR`;
- `EQUALS`, `NEQUALS`, `BETWEEN`, and `NBETWEEN`;
- closed, open and empty ranges;
- missing fields, `null`, empty strings, spaces, `-`, and empty arrays;
- primitive arrays and same-element semantics for arrays of objects;
- deterministic clean and edge-case fuzz combinations.

Small synthetic edge fixtures are added only to the isolated test database. They are marked with `_astDiffFixture` and removed in a `finally` block.

## Run

From the repository root on Windows/PowerShell:

```powershell
.\scripts\run-ast-differential.ps1
```

Useful parameters:

```powershell
.\scripts\run-ast-differential.ps1 -CaseLimit 7000 -FuzzCases 2000 -Seed 12345
```

The script preprocesses the complete demo OMOCK into a uniquely named `ovis_ast_diff_*` database, runs the comparison, writes `ast-differential-report.json` in this directory, and drops the test database. A non-zero exit code means at least one mismatch or execution error was found.

The pure reference-evaluator tests do not need MongoDB:

```powershell
node --test Backend\Apollo\differential\referenceEvaluator.test.mjs
```

The translator, shared AST utilities, study-patient integration, and reference evaluator can be
run together from `Backend\Apollo`:

```powershell
npm run test:ast
```

## Direct runner configuration

The Node runner accepts these environment variables:

- `ADDRESS`: Mongo connection string.
- `AST_DIFF_DB`: test database name; names without the `ovis_ast_diff_` prefix are rejected.
- `AST_DIFF_CASE_LIMIT`: maximum generated cases (default `5000`).
- `AST_DIFF_FUZZ_CASES`: number of seeded fuzz cases (default `800`).
- `AST_DIFF_SEED`: deterministic random seed.
- `AST_DIFF_MAX_FAILURES`: maximum detailed failures in the JSON report.
- `AST_DIFF_SEED_FIXTURES=0`: disable synthetic edge fixtures.
- `AST_DIFF_KEEP_FIXTURES=1`: retain fixtures for manual inspection.
- `AST_DIFF_DROP_DB_AFTER=1`: drop the isolated database after the run.
