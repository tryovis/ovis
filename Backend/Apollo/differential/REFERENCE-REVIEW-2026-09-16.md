# Independent filter-semantics review — 2026-09-16

The existing differential harness compared production Mongo queries with a separate JavaScript evaluator over **materialized** OMOCK records. That comparison did not independently verify the importer or the raw OMOCK calculations. It also shared several assumptions with the translator. Hand-calculated fixtures now provide a second check on those assumptions; raw-file metric comparisons are a separate test layer.

## Confirmed defects and regression examples

| Case                                                                                                          | Previous behavior                                                                        | Required result                                                            |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Patient has C34 tumor A with therapy X and C50 tumor B with therapy Y; filter is female AND C34 AND therapy Y | Adding the patient predicate let different tumors satisfy the two tumor predicates       | Patient excluded unless a single tumor satisfies the full expression       |
| One tumor has therapy X/curative and therapy Y/palliative; diagnosis criterion AND therapy X AND palliative   | A local criterion caused foreign clauses to be evaluated independently                   | Excluded unless one therapy record has both X and palliative               |
| Assigned foreign exclusion forbids systemic therapy; user additionally selects OP; tumor has both records     | Positive sibling could turn the exclusion into a per-record check and re-admit the tumor | Tumor remains excluded                                                     |
| One local filter row excludes A and B                                                                         | OR of `!= A` and `!= B` matched every ordinary scalar value                              | Both A and B excluded; the exclusion applies to the union of values/ranges |
| One-child NOR                                                                                                 | Several shortcuts treated it as the child itself                                         | Logical complement of the child                                            |
| Date range bound is ISO `2024-02-29T00:00:00Z`                                                                | String-to-number coercion advanced midnight to March 1                                   | Same boundary as the numeric timestamp for February 29                     |
| Therapy has OP and two operation entries `(x, first)`, `(y, second)`; OP AND operation x AND text second      | Unrelated scalar sibling disabled same-array-element matching                            | Excluded; one array entry must satisfy x and second                        |

The translator now preserves these scopes through transparent AND/single-OR wrappers, including wrappers introduced when combining an assigned filter with a user filter. Patient-only branches still include matching patients without tumors. Patient links are resolved from the patient's tumor IDs and from `diagnosis.patID`.

## Reference-only corrections

- A literal `null` comparison matches an explicitly null or absent field; it does not equal an empty array. A separate sentinel now distinguishes empty arrays from missing fields.
- A literal empty string remains an exact comparison. The OVIS `-` blank category includes missing, null, empty string, one space, `-`, and empty arrays.
- The reference recognizes operator-defined foreign exclusion groups without relying on a `!` prefix in the serialized key.
- Flat `grading_*` keys remain flat during key normalization.
- Study date fields `start` and `firstPatInPlanned` support ISO bounds despite not containing `Date` in their name.
- A null stored value is not coerced to the Unix epoch in date equality comparisons.

## Follow-up from full OMOCK comparisons

The demo source contains one therapy record whose tumor ID has no diagnosis and which has no patient ID. Unfiltered totals still include this source record. A foreign patient/diagnosis condition now requires an existing identity: a missing value on a known patient or diagnosis can match a null/negative filter, whereas an entirely absent identity cannot establish cohort membership. An explicit local event branch in an OR can still authorize the event. Mixed NOR/XOR expressions preserve the distinction between a known false predicate and an unknown identity; negation cannot convert the latter into authorization.

This deliberately replaces the earlier oracle assumption that a negative diagnosis criterion should include wholly unlinked events. Missing optional events remain different: a known tumor with no therapy can still satisfy an exclusion of a particular therapy type.

The full differential run also found that combining negative fields on an object array must not require an existing array entry. Same-element grouping now applies to positive equality/range predicates. Negative array predicates retain their top-level complement semantics, so absent, null and empty arrays remain in an ordinary value exclusion. A directed fixture covers two excluded radiation fields alongside the existing positive same-element tests.

## Nested Boolean expressions and request cost

A second manual review found a shared production/reference blind spot: `OP AND (palliative OR C34)` could accept a C50 tumor with one OP/curative record and another systemic/palliative record, although the equivalent `(OP AND palliative) OR (OP AND C34)` excluded it. The translator now distributes mixed-system OR and XOR choices inside conjunctions before applying same-record constraints. Whole source-system predicates remain atomic: `NOR(OP AND palliative)` means that no single therapy record has both properties, and does not mean that OP and palliative must both be absent across all records.

Hand-calculated regressions cover mixed OR, its distributed equivalent, mixed XOR, AND with NOR, and NOR of a conjunction. The independent reference evaluates alternatives directly over its in-memory records; it does not import the production normalizer, Mongo queries, or database result sets. Both still implement the same stated Boolean contract, so agreement between them alone is insufficient. Separate agent-calculated ID sets and the raw-source comparisons provide additional checks.

Unary AND, OR and XOR wrappers, and pairs of unary NOR wrappers, must preserve those results at every subtree. Metamorphic regressions insert each neutral wrapper at each position of seven hand-calculated expressions (151 variants). They caught further scope defects: a single-child XOR around a mixed OR, a double NOR around a positive event predicate, and wrappers inside a negative field group. Neutral wrappers now simplify before event scope is bound; negative field groups are recognized again after their children simplify, preserving the exclusion of the union of values. A single NOR around a whole event group remains intact.

Bare `NEQUALS` and `NBETWEEN` leaves are valid filters and now have the same foreign-source exclusion semantics as their unary OR field groups. Previously, `OP AND NEQUALS palliative` could match an OP/curative record despite a separate palliative record on the same tumor, while wrapping the negative leaf in OR excluded that tumor. A foreign negative leaf is now projected separately from the positive same-event conditions and excludes matching events across the tumor. When the filtered collection is the leaf's own source, the negative comparison still applies to each local document. Directed equality/range fixtures verify both contracts, bare and wrapped, including tumors without an optional event.

Nested XOR previously repeated database selections exponentially. Translation results, source scopes, positive/negative subtree results, and distinct selections are now memoized only within one `filter2match` request. A regression changes the underlying patient data between two requests to confirm that results are not reused across requests or permissions. The directed nested-XOR fixtures need at most 10 distinct calls per request through seven nesting levels.

Normalization is bounded to 256 expanded alternatives and 20,000 estimated query nodes. Excessive expressions fail with `FILTER_TOO_COMPLEX` / GraphQL `BAD_USER_INPUT` before database selections begin. These limits bound expression expansion, not total cohort size or every Mongo execution cost. Ordinary translation remains read-only.

## Test design and scope

The added reference tests state explicit expected booleans and ID sets, including negative controls where predicates occur on different tumors, records, or array entries. Production tests exercise the generated query semantics and inspect date/array query boundaries. The broader synthetic Mongo filter-lock matrix verifies actual Mongo behavior and mandatory-cohort containment; the OMOCK differential harness verifies exact IDs across many generated combinations.

Focused test command from the repository root:

```sh
node --test Backend/Apollo/astTranslator.test.js Backend/Apollo/astUtils.test.js Backend/Apollo/differential/referenceEvaluator.test.mjs Backend/Apollo/resolver/studyPatientTable.test.js
```

At this review's follow-up verification, all 85 focused tests passed. Full-run results belong in the generated differential/matrix reports. These tests establish the listed filter contracts on synthetic data; they are not a formal penetration test or proof for every clinical installation.
