import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = await build({
	stdin: {
		contents: `
			export { getNavigationAvailability } from './config/navigation-availability';
			export { getAvailableExportDatasets } from './lib/export-builder/availability';
		`,
		resolveDir: fileURLToPath(new URL('.', import.meta.url)),
		loader: 'ts'
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});
const { getNavigationAvailability, getAvailableExportDatasets } = await import(
	`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

const configuration = (enabled) => ({
	patient: { cohort: enabled, single: enabled },
	diagnosis: { enabled },
	tnm: { enabled },
	therapy: {
		general: enabled,
		operation: enabled,
		systemic: enabled,
		radiation: enabled,
		nuclear: enabled,
		other: enabled
	},
	timeline: { progress: enabled, tumorboard: enabled, consultation: enabled, status: enabled },
	survival: { enabled },
	supplementary: { enabled },
	molecular: { enabled },
	bioMaterial: { enabled },
	study: { enabled },
	export: { enabled },
	userManagement: { enabled },
	platformCustomization: { enabled },
	analytics: { enabled }
});

const ids = (config, isCCP) =>
	getAvailableExportDatasets(config, isCCP)
		.map((dataset) => dataset.id)
		.sort();
const allDatasetIds = [
	'patient',
	'diagnosis',
	'therapy',
	'radiation',
	'histology',
	'tnm',
	'progress',
	'metastasis',
	'tumorBoard',
	'consultation',
	'status',
	'molecularMarker',
	'bioMaterial',
	'studyPatient',
	'diagnostic',
	'study',
	'kaplanMeier',
	'followUp',
	'supplementary'
];

test('all enabled Demo navigation exposes consultation and studies but excludes CCP biomaterial', () => {
	const config = configuration(true);
	const nav = getNavigationAvailability(config, false);
	assert.equal(nav.consultation, true);
	assert.equal(nav.study, true);
	assert.equal(nav['bio-material'], false);
	assert.deepEqual(ids(config, false), allDatasetIds.filter((id) => id !== 'bioMaterial').sort());
});

test('all enabled CCP navigation exposes biomaterial but excludes Demo consultation and studies', () => {
	const config = configuration(true);
	const nav = getNavigationAvailability(config, true);
	assert.equal(nav.consultation, false);
	assert.equal(nav.study, false);
	assert.equal(nav['bio-material'], true);
	assert.deepEqual(
		ids(config, true),
		allDatasetIds.filter((id) => !['consultation', 'studyPatient', 'study'].includes(id)).sort()
	);
});

test('disabling all navigation leaves no export tables in either variant', () => {
	for (const isCCP of [false, true]) {
		const config = configuration(false);
		assert.ok(Object.values(getNavigationAvailability(config, isCCP)).every((visible) => !visible));
		assert.deepEqual(ids(config, isCCP), []);
		config.export.enabled = true;
		assert.deepEqual(
			ids(config, isCCP),
			[],
			'Enabling only Export does not expose clinical tables'
		);
	}
});

const independentlyEnabled = [
	['patient', 'cohort', 'patient-cohort', ['patient']],
	['patient', 'single', 'patient-single', ['patient']],
	['diagnosis', 'enabled', 'diagnosis', ['diagnosis', 'histology', 'diagnostic']],
	['tnm', 'enabled', 'tnm', ['tnm', 'metastasis']],
	['therapy', 'general', 'therapy-general', ['therapy']],
	['therapy', 'operation', 'therapy-operation', []],
	['therapy', 'systemic', 'therapy-systemic', []],
	['therapy', 'radiation', 'therapy-radiation', ['radiation']],
	['therapy', 'nuclear', 'therapy-nuclear', []],
	['therapy', 'other', 'therapy-other', []],
	['timeline', 'progress', 'progress', ['progress']],
	['timeline', 'tumorboard', 'tumorboard', ['tumorBoard']],
	['timeline', 'consultation', 'consultation', ['consultation'], 'demo'],
	['timeline', 'status', 'status', ['status']],
	['supplementary', 'enabled', 'supplementary', ['supplementary']],
	['molecular', 'enabled', 'molecular', ['molecularMarker']],
	['bioMaterial', 'enabled', 'bio-material', ['bioMaterial'], 'ccp'],
	['study', 'enabled', 'study', ['studyPatient', 'study'], 'demo'],
	['survival', 'enabled', 'survival', ['kaplanMeier', 'followUp']]
];

for (const [group, flag, route, expected, variant] of independentlyEnabled) {
	test(`${group}.${flag} exposes only its associated datasets and respects the variant`, () => {
		for (const isCCP of [false, true]) {
			const config = configuration(false);
			config.export.enabled = true;
			config[group][flag] = true;
			const visible = variant === 'ccp' ? isCCP : variant === 'demo' ? !isCCP : true;
			assert.equal(getNavigationAvailability(config, isCCP)[route], visible);
			assert.deepEqual(ids(config, isCCP), visible ? [...expected].sort() : []);
			config[group][flag] = false;
			assert.equal(getNavigationAvailability(config, isCCP)[route], false);
			assert.deepEqual(
				ids(config, isCCP),
				[],
				'A variant cannot override an explicitly disabled flag'
			);
		}
	});
}

test('radiation must be enabled separately even when another therapy page remains available', () => {
	for (const isCCP of [false, true]) {
		const config = configuration(true);
		config.therapy.radiation = false;
		const available = ids(config, isCCP);
		assert.ok(available.includes('therapy'));
		assert.ok(!available.includes('radiation'));
	}
});

test('disabling generic therapies does not expose other therapy types through radiation exports', () => {
	for (const isCCP of [false, true]) {
		const config = configuration(true);
		config.therapy.general = false;
		const available = ids(config, isCCP);
		assert.ok(available.includes('radiation'));
		assert.ok(!available.includes('therapy'));
	}
});

test('disabled Export exposes no datasets even when all clinical navigation is enabled', () => {
	for (const isCCP of [false, true]) {
		const config = configuration(true);
		config.export.enabled = false;
		assert.equal(getNavigationAvailability(config, isCCP).export, false);
		assert.deepEqual(ids(config, isCCP), []);
	}
});

test('administrative navigation does not add clinical export datasets', () => {
	for (const isCCP of [false, true]) {
		const config = configuration(false);
		for (const group of ['export', 'userManagement', 'platformCustomization', 'analytics']) {
			config[group].enabled = true;
		}
		assert.equal(getNavigationAvailability(config, isCCP).export, true);
		assert.deepEqual(ids(config, isCCP), []);
	}
});

test('availability preserves the locally discovered field catalogue', () => {
	const catalog = [
		{ id: 'diagnosis', fields: [{ id: 'custom.flag', type: 'text', label: 'custom.flag' }] },
		{ id: 'bioMaterial', fields: [{ id: 'custom.material', type: 'text' }] }
	];
	const result = getAvailableExportDatasets(configuration(true), false, catalog);
	assert.deepEqual(result, [catalog[0]]);
});

test('availability calculation does not mutate settings or retain previous variant results', () => {
	const config = configuration(true);
	const before = structuredClone(config);
	const demo = ids(config, false);
	ids(config, true);
	assert.deepEqual(ids(config, false), demo);
	assert.deepEqual(config, before);
});
