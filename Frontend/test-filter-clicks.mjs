import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFiles = [
	'src/lib/filterEditorModel.test.js',
	'src/lib/filterEditorOptions.test.js',
	'src/lib/filterDateInput.test.js',
	'src/graphQl/gql-filter-edit.test.mjs',
	'lensCatalogueSchemaPlugin.test.js',
	'src/tableFilterItems.test.mjs',
	'src/assignedFilterSelection.test.mjs',
	'src/chartFilterLens.test.mjs',
	'src/sharedFilterClicks.test.mjs',
	'src/routeChartFilters.test.mjs',
	'src/components/GenericSVG.filters.test.mjs',
	'src/components/GenericCategoryChart.requests.test.mjs',
	'src/components/quicktools/QuicktoolsActiveFilters.test.mjs',
	'src/routes/patient-cohort/patientCohortChartFilters.test.mjs',
	'src/routes/diagnosis/diagnosisBarChartFilterTarget.test.mjs',
	'src/routes/diagnosis/diagnosisBarChartLegendState.test.mjs',
	'src/stackedBarChartOverflow.test.mjs',
	'src/security-regression.test.mjs'
].map((path) => fileURLToPath(new URL(path, import.meta.url)));

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
	cwd: fileURLToPath(new URL('.', import.meta.url)),
	stdio: 'inherit'
});

if (result.error) throw result.error;
if (result.signal) console.error(`Filter regression tests stopped by ${result.signal}`);
process.exitCode = result.status ?? 1;
