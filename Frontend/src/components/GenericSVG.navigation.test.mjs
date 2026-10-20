import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const component = fs.readFileSync(new URL('./GenericSVG.svelte', import.meta.url), 'utf8');
const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile('GenericSVG.ts', script, ts.ScriptTarget.Latest, true);
const functions = parsed.statements.filter(
	(node) => ts.isFunctionDeclaration(node) && ['dynamicSVG', 'setCatalog'].includes(node.name?.text)
);
const executable = ts.transpileModule(functions.map((node) => node.getText(parsed)).join('\n'), {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

async function loadMap(type, values) {
	const context = vm.createContext({
		SVGType: type,
		currentLevel: 1,
		currentSVG: `/svg/${type === 'patient' ? 'patientWorldMaps' : type === 'therapy' ? 'radiationMap' : 'diagnosisBodymap'}/level1.svg`,
		currentCatalog: '',
		oldSVG_level2: '',
		oldSVG_level3: '',
		filter: '{}',
		publicAssetPath: (path) => path,
		replaceUmlauts: (label) => label,
		getDiagnosisBarChart: async ({ group }) => ({
			groups: (values[group] ?? []).map((label) => ({ label }))
		}),
		getPatientCohortMapChart: async (group) => (values[group] ?? []).map((label) => ({ label })),
		getTherapyRadiationMap: async (group) => (values[group] ?? []).map((label) => ({ label }))
	});
	vm.runInContext(executable, context);
	await context.dynamicSVG();
	return context;
}

for (const [group, diagnosis] of [['C81-C96', 'C81'], ['D00-D09', 'D09']]) {
	test(`single ${diagnosis} selection reaches full ICD codes even without a detail SVG`, async () => {
		const map = await loadMap('diagnosis', { ICD_ICD10Group: [group], ICD_ICD10_3: [diagnosis] });
		assert.equal(map.currentSVG, `/svg/diagnosisBodymap/level3_${diagnosis}.svg`);
		assert.equal(map.currentLevel, 3);
		assert.equal(map.currentCatalog, 'ICD_ICD10');
	});
}

test('D00-D09 selection reaches its individual diagnoses even without a group SVG', async () => {
	const map = await loadMap('diagnosis', { ICD_ICD10Group: ['D00-D09'], ICD_ICD10_3: ['D01', 'D09'] });
	assert.equal(map.currentSVG, '/svg/diagnosisBodymap/level2_D00-D09.svg');
	assert.equal(map.currentLevel, 2);
	assert.equal(map.currentCatalog, 'ICD_ICD10_3');
});

test('existing detail maps keep their parent for back navigation', async () => {
	const map = await loadMap('diagnosis', { ICD_ICD10Group: ['C30-C39'], ICD_ICD10_3: ['C34'] });
	assert.equal(map.currentSVG, '/svg/diagnosisBodymap/level3_C34.svg');
	assert.equal(map.oldSVG_level2, '/svg/diagnosisBodymap/level2_C30-C39.svg');
	assert.equal(map.currentLevel, 3);
	assert.equal(map.currentCatalog, 'ICD_ICD10');
});

test('empty results retain the overview and its matching aggregation', async () => {
	for (const [type, catalog] of [['diagnosis', 'ICD_ICD10Group'], ['patient', 'countryCode'], ['therapy', 'radiation_supArea']]) {
		const map = await loadMap(type, {});
		assert.equal(map.currentLevel, 1);
		assert.equal(map.currentCatalog, catalog);
	}
});

test('geographic drill-down reaches postal codes for a county without a map', async () => {
	const map = await loadMap('patient', { countryCode: ['DE'], state: ['Sachsen'], county: ['Dresden'] });
	assert.equal(map.currentSVG, '/svg/patientWorldMaps/level4_Dresden.svg');
	assert.equal(map.currentLevel, 4);
	assert.equal(map.currentCatalog, 'postalCode');
	assert.equal(map.oldSVG_level2, '/svg/patientWorldMaps/level2_DE.svg');
	assert.equal(map.oldSVG_level3, '/svg/patientWorldMaps/level3_Sachsen.svg');
});

test('a country without a map still reaches its state table', async () => {
	const map = await loadMap('patient', { countryCode: ['IS'], state: ['State A', 'State B'] });
	assert.equal(map.currentSVG, '/svg/patientWorldMaps/level2_IS.svg');
	assert.equal(map.currentCatalog, 'state');
});

test('radiation selection reaches subareas independently of SVG availability', async () => {
	const map = await loadMap('therapy', { radiation_supArea: ['9'] });
	assert.equal(map.currentSVG, '/svg/radiationMap/level2_9.svg');
	assert.equal(map.currentLevel, 2);
	assert.equal(map.currentCatalog, 'radiation_subArea');
});
