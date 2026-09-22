# Filter click regression test

`filterClicks.mjs` opens a real local OVIS Vite app in Chromium. It clicks rendered charts, SVG organs, table cells, quick selections, the filter editor and dialogs. Chart.js and SVG geometry are read only to locate a painted screen position; insertion handlers are never called directly. Lens query state is read after each interaction to check the result.

The script intercepts catalogue, authentication and GraphQL requests with synthetic records. It does not need a backend, database, real account or clinic data. It accepts only a loopback URL and aborts browser HTTP requests to other origins. Use an isolated development app with its normal static assets and Lens Vite plugin enabled.

## Run

Requirements: Node.js, an installed Playwright package, an installed `graphql` package and Chromium/Chrome. The script does not install packages or browsers. Start the frontend dev server on a loopback address first.

From `Frontend`, when dependencies and the Playwright browser are already available:

```sh
OVIS_TEST_URL=http://127.0.0.1:5179 OVIS_TEST_OUTPUT=./click-results/restricted node e2e/filterClicks.mjs
OVIS_TEST_URL=http://127.0.0.1:5179 OVIS_TEST_OUTPUT=./click-results/unrestricted node e2e/filterClicks.mjs --unrestricted
```

Optional environment variables:

| Variable                 | Meaning                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `OVIS_TEST_URL`          | Local dev app URL, default `http://127.0.0.1:5179`                                                 |
| `OVIS_TEST_OUTPUT`       | Screenshot and JSON output directory                                                               |
| `OVIS_PLAYWRIGHT_MODULE` | Resolvable module name or absolute path to an existing Playwright package                          |
| `OVIS_GRAPHQL_MODULE`    | Resolvable module name or absolute path to an existing GraphQL package                             |
| `OVIS_CHROMIUM`          | Path to an installed Chromium/Chrome executable; otherwise Playwright's configured browser is used |

## Coverage and limits

Both profiles run the same interaction matrix. The default profile has a mandatory `C30-C39` assignment and empty categorical catalogue criteria; `--unrestricted` has populated criteria and no assigned scope.

The matrix checks gender and vital-status pies, age scatter points, C34 in the lung SVG, diagnosis year bars, diagnosis/histology quick selections, value and row removal, undo/redo/reset, date and number dialogs, category table cells, exact and grouped TNM dialogs, generic category and study charts, the molecular-marker stacked chart, and editing/saving separate OR groups. It also checks combinations, filter toggling and assigned-scope preservation in outgoing requests.

Each case writes a screenshot and a query/AST snapshot to `results.json`. Failures stop the run. Browser errors, including errors during navigation, fail the complete run.

Fixtures intentionally remain constant when filters change: the test verifies click-to-query behavior and request scope, not database counts. Backend authorization and date-boundary behavior require the separate backend and Lens integration tests. This is not a penetration test or proof of compatibility with every deployment, browser or dataset.

## Table maximize and resize regression

`tableResize.mjs` uses the same local-only browser setup and environment variables, with synthetic paginated GraphQL responses. Run it against an isolated frontend production build (`npm run build`, then `npm run preview -- --host 127.0.0.1 --port 5179 --strictPort`). Do not load deployment environment files into the test app.

```sh
OVIS_TEST_OUTPUT=./table-resize-results/desktop node e2e/tableResize.mjs
OVIS_TEST_OUTPUT=./table-resize-results/mobile node e2e/tableResize.mjs --mobile
```

The desktop matrix covers therapy, histology, study and patient-cohort tables at 1900×1050 and 1900×760. It clicks maximize/restore repeatedly, changes the viewport while maximized, checks short last pages, and exercises empty, one-row and three-row results. Real column-filter interactions restore a full result set after zero, one and three matches. The mobile profile uses a 1280×700 touch viewport and checks that the application's landscape layout is actually active.

Each phase checks rendered rows against the requested page size and offset, stable totals, and the absence of repeated requests or table redraws while idle. Screenshots and `report.json` are written even on failure. `--baseline` runs only the initial therapy scenario with the same stability assertions, useful for demonstrating the previous shrinking-row bug. These are UI pagination checks, not a backend calculation audit.

Recorded on 2026-09-16 against an isolated Linux production build: the previous build requested page sizes 7, 6, 5, 4, 3, 2, 1 after maximizing. The fix passed all 90 desktop phases and 5 mobile landscape phases with zero browser errors. The accompanying table suites passed 29 tests on Linux and 19 portable tests on Windows; three older test files still use Linux-specific temporary import paths and were verified on Linux.

## Filter editor combinations and request budget

`filterEditor.mjs` uses the same local-only setup, packages and environment variables against an isolated production build. GraphQL, authentication and the catalogue use synthetic fixtures; no real users are updated.

```sh
OVIS_TEST_OUTPUT=./editor-results/restricted node e2e/filterEditor.mjs
OVIS_TEST_OUTPUT=./editor-results/unrestricted node e2e/filterEditor.mjs --unrestricted
OVIS_TEST_OUTPUT=./editor-results/admin node e2e/filterEditor.mjs --admin
```

The ordinary profiles exercise actual editing controls and saving/reopening through Lens: multiple AND/OR groups, negation followed by another value, date/number ranges, open and missing bounds, empty strings, duplicated values, malformed field input, same-field reselection and per-collection identity. Seeded 23- and 2,000-value selections cover pagination, deletion and round trips; an invalid range on a hidden page must prevent saving. User-assigned cohort restrictions must remain intact and outside editable personal selections.

The admin profile delays a synthetic user-update response, returns a failed acknowledgment, then permits a retry. Navigation must wait for confirmation; the actual acting user must be recorded. The ordinary profile also checks that a normal user cannot open the permission editor.

The request budget counts value-option requests during 3.5 seconds after opening a blank editor, then checks reuse for an already selected field. DOM checks bound the number of rendered inputs and suggestions for large selections. Timing and long-task measurements are diagnostic observations rather than hardware-independent performance assertions. `--baseline` records the former eager-load, hidden-page validation and malformed-field failures. Results and failure screenshots are written to the output directory.

Recorded on 2026-09-16: the blank editor with 131 catalogue entries made 116 value-option requests before the change and zero afterward within the same 3.5-second observation. Selecting and reselecting gender needed one request. A 2,000-value selection retained every value while rendering ten value inputs and 40 shared suggestion nodes. The expanded frontend runner passed 157 tests on both Windows (Node 24) and Linux (Node 20). These measurements establish reduced requests and rendering work; they do not establish a fixed wall-clock speedup on clinic servers.

The final production browser matrix passed all 35 scenarios (16 restricted, 16 unrestricted, 3 administrator), including saving and reopening decimal bounds 0.25–12.5, with zero browser errors. Open-editor combination screenshots and a failed-administrator-save screenshot supplement the JSON results.

## Nuclear medicine and other therapy pages

`therapyDetails.mjs` uses the same package/browser environment variables against a
local production preview (default `http://127.0.0.1:5189`). Run after building the
new routes:

```sh
OVIS_TEST_OUTPUT=./therapy-details-results node e2e/therapyDetails.mjs
```

Every API response is intercepted; other origins and unrecognised API routes are
blocked. Synthetic fixtures mix nuclear medicine, other, systemic and radiation
therapies, and patients inside/outside an assigned `gender = w` restriction. The
fixture evaluates outgoing filter expressions, sorting, pagination and column
filters, so missing view or patient scopes affect the returned records.

The German UI matrix clicks both menu links, checks table totals and rows,
maximizes/restores tables, sorts labels in both directions, filters codes, checks
empty results and legacy records without the new fields, and downloads complete
and filtered CSV files with separate codes and labels. Chart controls exercise
radionuclides, radiopharmaceuticals and optional designations, including the chart's
table view. Separate click regressions seed a synthetic mixed nuclear/other Lens
selection, then click rendered chart-table and detail-table cells to check that
the resulting selection retains only the current therapy type and preserves the
assigned patient restriction. Seeding is setup, not the interaction under test.

Screenshots, CSV downloads and `report.json` are written to the output directory;
failure captures include the DOM text. This validates frontend behavior with
synthetic responses, not live Onkostar data or backend query execution.

Recorded on 2026-09-17 against the final production build: all 22 scenarios passed
with zero browser errors. Full/filtered CSV downloads contained 13/5 nuclear
medicine records and 8/3 other therapy records. Screenshots wait for Chart.js
animation and require more painted chart pixels than legend swatches alone.
