# Demo data

`omock.json` is the bundled input for `OVIS_IMPORT_MODE=demo`. The importer image
copies this file at build time. A file supplied through `OVIS_SITE_OMOCK_FILE`
takes precedence over the bundled copy.

## Radiation therapies

All 1,057 radiation therapies now have at least one single-radiation detail.
The 39 original `singleRadiation` records are preserved exactly; 1,020 missing
details were appended using deterministic synthetic UI fixtures. No existing
therapy, diagnosis, patient or other collection was changed for this addition.

The added fixtures cover teletherapy and brachytherapy, photon and electron
radiation, IMRT, VMAT and conformal techniques, stereotactic and breath-controlled
examples, primary sites and regional lymph nodes. Anatomical target codes follow
the existing diagnosis localization and use the preprocessor's area catalogue.
Single and total doses are in `Gy`, with each total equal to the single dose
multiplied by 4, 5, 10, 20, 25 or 30 fractions. These are representative software
test combinations, not treatment recommendations or clinically validated plans.
They contain no values copied from a clinical or test-system export.

Existing start dates remain unchanged. All 1,020 affected parent therapies have
no end date, which remains missing; no treatment calendar or completion date is
invented. The brachytherapy dose-delivery `duration` stays null rather than being
used as a course duration. Original demo details can contain inconsistent dose
values and are retained for backwards compatibility.

After preprocessing, `/therapy-radiation` should show 1,058 detail rows across
1,057 therapies, with populated type, dose and target fields. The raw collection
has 1,059 records: the original detail for therapy `115` belongs to an existing
systemic therapy and is therefore absent from the radiation page. The original
therapy ID `133` is shared by a radiation and an operation record; its existing
detail is preserved. Every newly added detail has exactly one radiation parent,
and no new duplicate IDs or ambiguous references were introduced.

## Nuclear medicine and other therapies

The synthetic demo includes 229 nuclear medicine and 15 other therapy records:

- The 223 existing nuclear medicine records now include the nullable source-code,
  detail, radionuclide and radiopharmaceutical fields. The 18 records without a
  therapy type retain empty details to exercise missing-value handling.
- Six additional nuclear medicine records cover PSMA, radioiodine and
  radioimmunotherapy. Together with the existing PRRT, SIRT and other metabolic
  radionuclide therapies, they cover all six therapy types.
- Twelve additional other therapy records cover TACE, radiofrequency ablation,
  transarterial embolisation, microwave ablation, light/photodynamic therapy and
  the `A` code. For `A`, the source-code fallback is intentional: one example has
  detail `nbz` (nicht näher bezeichnet), and one has no additional detail.
- Radionuclides cover `Lu-177`, `Y-90`, `Ra-223`, `J-131` and `Sm-153`.
  Radiopharmaceuticals cover `DOTA-TATE`, `DOTA-TOC`, `IBRI` and `TOSI`.

New therapy IDs are `900001`–`900006` (nuclear medicine) and
`900007`–`900018` (other therapies), linked to existing demo tumours and patients.
They can also be found through organisational units `Demo Nuklearmedizin` and
`Demo Onkologie`. These are UI test values; these additions preserve existing
clinical fields and other input collections.

After import, use `/therapy-radiation`, `/therapy-nuclear` and `/therapy-other`
to test table columns, category charts, filters and CSV exports.

## Refreshing a local demo

Rebuilding the importer updates its
bundled file; an existing database also needs its materialised therapy data and
dependent collections rebuilt. Restarting only the frontend or importer does
not replace populated MongoDB collections.

For an existing demo stack using the current application images, wait until
preprocessing is idle, then run these commands from the repository root:

```sh
docker compose cp Backend/Data-Import/demo/omock.json ovis-backend-mongodb-data-preprocessing:/app/Preprocessing/omock.json
docker compose exec -T ovis-backend-mongodb-data-preprocessing node ./Preprocessing/preprocessor.mjs therapy diagnosis followUp kaplanMeier
docker compose exec -T ovis-backend-mongodb-data-preprocessing node ./createCatalog.mjs
```

This replaces the demo's four named collections, rebuilds the catalogue and
retains other collections, including user accounts. Reload the browser afterward.
