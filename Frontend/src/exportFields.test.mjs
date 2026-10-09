import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
	stdin: {
		contents: `export * from './lib/export-builder/fields';
			export * from './lib/export-builder/model';
			export { default as translations } from './store/translations';`,
		resolveDir: fileURLToPath(new URL('.', import.meta.url)),
		loader: 'ts'
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});
const {
	datasets,
	mergeExportFields,
	exportFieldLabel,
	buildTablePlan,
	buildPreview,
	translations
} = await import(
	`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const fields = (...ids) => ids.map((id) => ({ id, type: 'text' }));

test('Mongo fields replace the curated subset and retain exact nested/custom paths', () => {
	const before = structuredClone(datasets);
	const catalog = mergeExportFields(datasets, {
		diagnosis: fields(
			'_id',
			'tumorID',
			'metastasis',
			'recurrence',
			'previousTherapy.surgery',
			'grading_first',
			'distress',
			'custom.newFlag',
			'ECOG',
			'unknownDate'
		)
	});
	const result = catalog.find((d) => d.id === 'diagnosis').fields;
	assert.deepEqual(
		new Set(result.map((f) => f.id)),
		new Set([
			'_id',
			'tumorID',
			'metastasis',
			'recurrence',
			'previousTherapy.surgery',
			'grading_first',
			'distress',
			'custom.newFlag',
			'ECOG',
			'unknownDate'
		])
	);
	assert.equal(result[0].id, 'tumorID');
	assert.equal(result[0].default, true);
	for (const language of ['de', 'en']) {
		const translate = (key) => {
			assert.ok(translations[language][key], key);
			return translations[language][key];
		};
		for (const field of result) assert.ok(exportFieldLabel(field, translate));
		assert.equal(
			exportFieldLabel(
				result.find((f) => f.id === 'custom.newFlag'),
				translate
			),
			'custom.newFlag'
		);
		assert.equal(
			exportFieldLabel(
				result.find((f) => f.id === 'previousTherapy.surgery'),
				translate
			),
			translations[language].receivedSurgery
		);
	}
	assert.deepEqual(datasets, before);
	result[0].label = 'local';
	assert.deepEqual(datasets, before);
});

test('undiscovered and empty collections preserve independent seed metadata', () => {
	for (const schema of [{}, { diagnosis: [] }]) {
		const catalog = mergeExportFields(datasets, schema);
		assert.deepEqual(catalog, datasets);
		assert.notEqual(catalog[0], datasets[0]);
		assert.notEqual(catalog[0].fields[0], datasets[0].fields[0]);
	}
});

test('server types distinguish date scalars from complete arrays and mixed values', () => {
	const catalog = mergeExportFields(datasets, {
		diagnosis: [
			{ id: 'diagnosisDate', type: 'text' },
			{ id: 'ageAtDiagnosis', type: 'number' },
			{ id: 'customDate', type: 'date' }
		]
	});
	const byId = Object.fromEntries(
		catalog.find((d) => d.id === 'diagnosis').fields.map((f) => [f.id, f])
	);
	assert.equal(byId.diagnosisDate.type, 'text');
	assert.equal(byId.ageAtDiagnosis.type, 'number');
	assert.equal(byId.customDate.type, 'date');
});

test('discovered derived fields reach the preview without recomputation or row expansion', () => {
	const catalog = mergeExportFields(datasets, {
		diagnosis: fields('tumorID', 'recurrence', 'metastasis', 'custom.values')
	});
	const plan = buildTablePlan('diagnosis', []);
	const columns = ['recurrence', 'metastasis', 'custom.values'].map((field) => ({
		dataset: 'diagnosis',
		field,
		alias: field
	}));
	const data = {
		diagnosis: [
			{ tumorID: 'T1', recurrence: 'false', metastasis: null, 'custom.values': '[false,0,null,""]' }
		]
	};
	assert.deepEqual(buildPreview(plan, columns, data, catalog).rows, [
		{
			'diagnosis.recurrence': 'false',
			'diagnosis.metastasis': null,
			'diagnosis.custom.values': '[false,0,null,""]'
		}
	]);
	assert.throws(() => buildPreview(plan, columns, data));
});

test('study metadata joins by stable studyKey, and outcome collections stay linked by tumorID', () => {
	const plan = buildTablePlan('diagnosis', ['study', 'diagnostic', 'kaplanMeier', 'followUp']);
	assert.ok(plan.some((entry) => entry.dataset === 'studyPatient'));
	const data = {
		diagnosis: [{ tumorID: 'T1', patID: 'P1' }],
		patient: [{ patID: 'P1' }],
		studyPatient: [{ patID: 'P1', studyKey: 'S1' }],
		study: [
			{ studyKey: 'S1', studyID: 'REUSED', shortname: 'correct' },
			{ studyKey: 'S2', studyID: 'REUSED', shortname: 'wrong' }
		],
		diagnostic: [
			{ tumorID: 'T1', investigationMethod: 'radiology' },
			{ tumorID: 'T2', investigationMethod: 'unrelated' }
		],
		kaplanMeier: [{ tumorID: 'T1' }],
		followUp: [{ tumorID: 'T1' }]
	};
	const columns = [
		{ dataset: 'study', field: 'shortname' },
		{ dataset: 'diagnostic', field: 'investigationMethod' }
	];
	assert.deepEqual(buildPreview(plan, columns, data).rows, [
		{ 'study.shortname': 'correct', 'diagnostic.investigationMethod': 'radiology' }
	]);
});
