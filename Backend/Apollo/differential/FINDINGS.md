# Verified differential findings

## Materialized study-patient verification

The follow-up run on `feature/study-patient-linking` split the importer-compatible nested
`studyPatients` input into separate `study` and `studyPatient` collections. Study metadata and
participations are linked by `studyKey`; participations link to patients through `patID`, and to
tumors through `diagnosis.patID` without storing derived tumor IDs on either study collection.

The complete demo OMOCK was rebuilt in a fresh isolated database and the same independent
reference comparison was repeated with seed `185422342`:

- 3,305 of 3,305 exact ID-set matches
- 0 mismatches
- 0 Mongo aggregation errors
- 305 materialized fields across 18 systems
- 92 study documents and 273 materialized study-patient documents

The directed regression suite also verifies both navigation directions: a diagnosis filter
returns only matching study-patient rows, while a study metadata filter returns every
participation of the matching study. Mixed `AND`, `OR`, `NOR`, and `XOR` expressions retain
participation-level semantics. Cross-system `AND` clauses must resolve on the same tumor even
when combined with study metadata, and matching studies without any participations remain in
the study overview. The final local run passed 41 AST/resolver tests and 2 study-materialization
tests.

## Resolution

The translator was restructured after the baseline run below. The final verification used the
same seed (`185422342`), rebuilt the complete demo OMOCK in a fresh isolated database, and
repeated all generated comparisons:

- 3,273 of 3,273 exact ID-set matches
- 0 mismatches
- 0 Mongo aggregation errors
- 301 materialized fields across 17 systems

The rewrite centralizes key-only AST normalization and logical composition, uses explicit
system-aware field metadata for arrays and BSON dates, and expresses empty values, negated
ranges, same-element array matching, cross-system complements, patient cohorts, and exact-one
XOR through shared code paths. The public AST shape and incoming field names remain unchanged.

The retained baseline below documents the defects that the differential suite now guards
against.

Run date: 2026-08-07

Branch baseline: `feature/flat-histology-collection` at `2f9d156`

Seed: `185422342`

## Result

- 3,273 deterministic comparisons
- 301 discovered materialized fields across 17 systems
- 2,915 exact ID-set matches
- 356 ID-set mismatches
- 2 Mongo aggregation errors
- Full run time: about 103 seconds after preprocessing

The 356 mismatches are not 356 unrelated bugs. Most reduce to the cause groups below.

## Confirmed cause groups

### Flat underscore fields

The diagnosis fields `grading_first`, `grading_last`, `grading_lowest`, and `grading_highest` are rewritten to nested paths such as `grading.first`. All four deterministic local `EQUALS` controls returned zero rows instead of the expected 681-row example set. The corresponding local empty, cross-system, patient-cohort, OR-value, and negation cases fail for the same reason.

This directly affects the grading aggregates introduced with the flat histology refactor. The flat `ICDO_*` fields are explicitly protected by the parser and passed their controls.

### Study AST parsing

The study-patient path still performs underscore replacement on the complete serialized JSON value. A study shortname such as `study_edge_one` is therefore changed before comparison and returns no rows. Mixed study/diagnosis filters using flat `ICDO_*` fields fail for the same parser reason.

### Open date bounds

Date bounds are rounded before checking whether they are null. A lower-only diagnosis-date filter (`min` set, `max: null`) returned zero rows instead of 1,519. The equivalent negated open range returned 3,268 instead of 1,751.

### Empty and missing values

Empty arrays are not treated as empty values. Reproductions cover `diagnosis.ECOG`, `therapy.surgeon`, follow-up date arrays, `metastasisResection`, and nested therapy arrays.

Cross-system empty checks additionally lose target rows whose tumor has no source document. Study fields expose another variant: study `tumorID` is an array, but the empty-value helper does not flatten it consistently. This cause group accounts for 106 of the deterministic cross-system empty mismatches.

### Same-element array semantics

AND conditions on different subfields can be satisfied by different elements of one object array. Automatically minimized examples reproduce this for:

- `therapy.complication`
- `therapy.ops`
- `therapy.radiation`
- `therapy.substance`

Date ranges on primitive date arrays have a related issue: Mongo can satisfy `$gte` with one array element and `$lte` with another. The remaining clean OR/NOR/XOR fuzz mismatches all contain follow-up date-array ranges of this form.

### Negated ranges

Closed `NBETWEEN` controls differed for 46 of 63 numeric/date fields. The common reason is that missing/null values do not remain in the result when a concrete interval is excluded. This affects scalar fields and is amplified for arrays.

### Mixed therapy ECOG representation

`therapy.ECOG` contains scalar strings in the materialized OMOCK data, while the translator treats it as an array field. A local `NEQUALS` case fails with `input to $filter must be an array not string`; an edge fuzz case reaches the same mismatch through `$size`.

### Negation shape from the filter editor

Special `NEQUALS`/`NBETWEEN` handling depends on a negated key on the parent OR group. The filter editor can emit a negated child without that parent key. The minimized fixture selects one extra therapy row in that shape.

### Multi-branch XOR

For more than two branches, the Mongo expression implements “at least one, but not all” rather than “exactly one”. This is the dominant cause in the edge XOR fuzz class. Two-branch XOR controls pass unless one branch already contains one of the array/range issues above.

### Study dates without `Date` in the key

`study.start` and `study.firstPatInPlanned` are BSON dates, but the AST date handling is selected by the field name containing `date`. Closed range controls for both fields returned zero rows. Their catalogue/UI typing needs to agree with their materialized BSON type.

## Positive controls

- The separate histology collection joins correctly to diagnosis by `tumorID`.
- Flat diagnosis and histology `ICDO_*` filters pass.
- Foreign same-entry AND and cross-system same-tumor AND pass their minimized fixtures.
- Clean generated AND combinations passed 85/85.
- The flattened study-patient row semantics pass for ordinary study, patient, and diagnosis filters when the parser issue is not involved.
- Existing AST, study-patient, histology-model, and new reference tests pass (30 tests in the combined regression run at the time of this report).

The generated `ast-differential-report.json` contains the concrete AST, expected and actual counts, and missing/unexpected IDs for every retained failure detail.
