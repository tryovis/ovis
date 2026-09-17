import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OVIS_PLAYWRIGHT_MODULE || 'playwright');
const { parse, valueFromASTUntyped } = require(process.env.OVIS_GRAPHQL_MODULE || 'graphql');
const base = process.env.OVIS_TEST_URL || 'http://127.0.0.1:5179';
assert.ok(
	['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname),
	'Only a local isolated app is supported'
);
const out = path.resolve(process.env.OVIS_TEST_OUTPUT || 'filter-editor-results');
fs.mkdirSync(out, { recursive: true });
const restricted = !process.argv.includes('--unrestricted');
const baseline = process.argv.includes('--baseline');
const admin = process.argv.includes('--admin');
let adminSaveAcknowledged = false;
const browser = await chromium.launch({
	headless: true,
	...(process.env.OVIS_CHROMIUM ? { executablePath: process.env.OVIS_CHROMIUM } : {})
});
const context = await browser.newContext({
	viewport: { width: 1900, height: 1050 },
	timezoneId: 'Europe/Berlin'
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [],
	requests = [],
	cases = [];
page.on('pageerror', (e) => {
	errors.push(e.stack);
	console.log('PAGEERROR', e.stack);
});
page.on('console', (m) => {
	if (m.type() === 'error') {
		errors.push(m.text());
		console.log('CONSOLEERROR', m.text());
	}
});
page.on('dialog', (d) => {
	errors.push('dialog: ' + d.message());
	d.dismiss();
});
const assigned = {
	operand: 'OR',
	children: [
		{
			operand: 'AND',
			children: [
				{
					key: 'ICD_ICD10Group',
					operand: 'OR',
					children: [
						{
							key: 'ICD_ICD10Group',
							system: 'diagnosis',
							type: 'EQUALS',
							value: 'C30-C39'
						}
					]
				}
			]
		}
	]
};
const stored = {
	currentUser: 'synthetic-browser-user',
	currentRole: admin ? 'admin' : 'user',
	currentLanguage: 'en',
	currentTheme: false,
	primaryColorRGB: { r: 0, g: 128, b: 80 },
	primaryColor: '#008050',
	colorPalette: ['#008050', '#229966', '#55bb99'],
	paletteName: 'CCCMunich',
	darkMode: false,
	chartShowTop5: false,
	chartHideNullValues: false,
	pseudonymization: false,
	currentFilter: restricted ? JSON.stringify(assigned) : '',
	keycloakTokens: {
		access_token: 'synthetic-local-token',
		refresh_token: 'synthetic-local-refresh',
		expires_in: 36000,
		timestamp: Date.now()
	}
};
await page.addInitScript(
	(value) => localStorage.setItem('loggedInUser', JSON.stringify(value)),
	stored
);
const field = (system, key, values, fieldType = 'single-select') => ({
	key,
	name: key,
	system,
	type:
		(key.startsWith('!') ? 'N' : '') +
		(fieldType === 'number' || fieldType === 'date' ? 'BETWEEN' : 'EQUALS'),
	fieldType,
	criteria: (restricted ? [] : values).map((value) => ({
		key: value,
		name: String(value)
	}))
});
const fields = {
	patient: {
		gender: ['m', 'w', 'd'],
		vitalState: ['alive', 'dead'],
		state: ['Bayern'],
		country: ['Deutschland'],
		county: ['Muenchen'],
		postalCode: ['80000'],
		patID: Array.from({ length: 40 }, (_, i) => 'SYNTHETIC-' + (i + 1))
	},
	diagnosis: {
		ICD_ICD10Group: ['C30-C39', 'C50-C59'],
		ICD_ICD10_3: ['C34', 'C32', 'C50'],
		ICD_ICD10: ['C34.1', 'C32.1'],
		ICDO_histologyCode: ['8140/3', '8070/3'],
		gender: ['m', 'w'],
		primaryCase: ['Ja', 'Nein'],
		recurrence: ['true', 'false'],
		centerCase: ['Ja', 'Nein'],
		internal: ['Meine Einrichtung'],
		isTumor: ['true'],
		rareCancer: ['true'],
		oz_lung: ['true']
	},
	histology: { ICDO_histologyCode: ['8140/3', '8070/3'] },
	tnm: {
		UICC: ['II', 'III'],
		type: ['p', 'c'],
		T: ['2', '2a', '3'],
		TGroup: ['2', '3'],
		N: ['0', '1'],
		NGroup: ['0', '1'],
		M: ['0', '1'],
		MGroup: ['0', '1']
	},
	molecularMarker: { type: ['EGFR'], status: ['positiv', 'negativ'] },
	therapy: { type: ['OP', 'ST'], intention: ['K', 'P'] },
	study: { shortname: ['SYNTH-A', 'SYNTH-B'] }
};
for (let i = 0; i < 30; i++) fields.diagnosis['unused' + i] = ['SYNTHETIC-unused'];
const catalogue = Object.entries(fields).map(([system, items]) => ({
	key: system,
	name: system,
	childCategories: Object.entries(items).flatMap(([key, values]) => [
		field(system, key, values),
		field(system, '!' + key, values)
	])
}));
catalogue
	.find((c) => c.key === 'diagnosis')
	.childCategories.push(
		field('diagnosis', 'diagnosisDate', [], 'date'),
		field('diagnosis', '!diagnosisDate', [], 'date'),
		field('diagnosis', 'ageAtDiagnosis', [], 'number')
	);
catalogue
	.find((c) => c.key === 'patient')
	.childCategories.push(field('patient', 'birthDate', [], 'date'));
catalogue.find((c) => c.key === 'study').childCategories.push(field('study', 'start', [], 'date'));
const records = Array.from({ length: 18 }, (_, i) => ({
	_id: 'synthetic-' + i,
	patID: 'SYNTHETIC-' + (i + 1),
	tumorID: 'SYNTHETIC-T' + (i + 1),
	firstName: 'Synthetic',
	lastName: 'Case ' + i,
	gender: ['m', 'w', 'd'][i % 3],
	birthDate: Date.UTC(1960 + i, 0, 1),
	postalCode: '80000',
	area: 'Muenchen',
	countryCode: 'DE',
	vitalDate: Date.UTC(2026, 0, 1),
	vitalState: i % 2 ? 'dead' : 'alive',
	diagnosisDate: Date.UTC(2024 + (i % 3), 5, 15),
	ageAtDiagnosis: 60 + (i % 8),
	ICD: { ICD10: 'C34.1' },
	ICDO_histologyCode: '8140/3',
	ICDO_histologyCodeText: 'Synthetic histology',
	ICDO_grading: 'G2',
	ICDO_source: 'synthetic',
	ICDO_histologyDate: Date.UTC(2026, 0, 1),
	ICDO_mixedTumor: false,
	investigationMethod: 'Synthetic biopsy',
	diagnosticOccurrenceDate: Date.UTC(2026, 0, 1)
}));
function respond(name, v = {}) {
	if (name === 'getPlatformConfiguration')
		return {
			colorTheme: 'CCCMunich',
			colorPalette: stored.colorPalette,
			systemLanguage: 'en',
			source: 'TEST',
			documents: []
		};
	if (name === 'getUser')
		return [
			{
				_id: stored.currentUser,
				role: stored.currentRole,
				status: 'active',
				language: 'en',
				firstLogin: Date.now(),
				darkMode: false,
				userFilter: [stored.currentFilter],
				filter: stored.currentFilter
			},
			{
				_id: 'synthetic-edit-target',
				role: 'user',
				status: 'active',
				language: 'en',
				userFilter: [JSON.stringify(wrap([leaf('gender', 'patient', 'm')]))]
			}
		];
	if (name === 'updateUser' && v.id === 'synthetic-edit-target')
		return {
			acknowledged: adminSaveAcknowledged,
			matchedCount: adminSaveAcknowledged ? 1 : 0,
			modifiedCount: adminSaveAcknowledged ? 1 : 0
		};
	if (name === 'getLastMetaData') return { executedAt: Date.now() };
	if (name.startsWith('update') || name === 'recordUsageEvents') return { acknowledged: true };
	if (name === 'getQuicktoolsBasicsIcd10')
		return ['C30-C39 → Respiratory', 'C34 → Lung', 'C32 → Larynx'];
	if (name === 'getQuicktoolsBasicsHistology')
		return ['8140/3 → Synthetic adenocarcinoma', '8070/3 → Synthetic'];
	if (name === 'getQuicktoolsCountOverview')
		return ['patient', 'diagnosis', 'therapy', 'progress'].map((collection) => ({
			collection,
			count: 18
		}));
	if (name === 'getPatientCohortGenderChart') return { label: ['m', 'w', 'd'], count: [6, 7, 5] };
	if (name === 'getPatientCohortDeathChart') return { label: ['alive', 'dead'], count: [10, 8] };
	if (name === 'getPatientCohortAgeChart')
		return [
			{ ageAtDiagnosis: 60, count: 6 },
			{ ageAtDiagnosis: 65, count: 7 },
			{ ageAtDiagnosis: 70, count: 5 }
		];
	if (name === 'getPatientCohortMapChart')
		return [
			{ label: 'Deutschland', description: 'Deutschland', count: 18 },
			{ label: 'Bayern', description: 'Bayern', count: 18 }
		];
	if (name === 'getTumors') {
		const g = v.getTumorsGroupedBy ?? {};
		const labels =
			g.group === 'ICD_ICD10_3'
				? ['C34', 'C32']
				: g.group === 'ICD_ICD10'
				? ['C34.1', 'C32.1']
				: ['C30-C39'];
		return {
			category: g.abscissa === 'none' ? ['none'] : ['2024', '2025', '2026'],
			groups: labels.map((label, i) => ({
				label,
				description: label,
				gender: 'm',
				count: g.abscissa === 'none' ? [i ? 6 : 12] : [4, 5, 3]
			}))
		};
	}
	if (name === 'getTnmCount')
		return [
			{ T: '2', N: '1', M: '0', count: 8 },
			{ T: '3', N: '0', M: '0', count: 10 }
		];
	if (name === 'getTnmMetastases')
		return records.slice(0, 6).map((r) => ({
			...r,
			T: '2',
			N: '1',
			M: '0',
			type: 'p',
			version: '8',
			tnmOccurrenceDate: Date.UTC(2026, 0, 1)
		}));
	if (/Count|count/.test(name)) return 18;
	if (name === 'getCategoryChart')
		return {
			label:
				v.collection === 'tnm'
					? v.selectedType === 'type'
						? ['p', 'c']
						: ['II', 'III']
					: ['OP', 'ST'],
			count: [10, 8]
		};
	if (name === 'getMolecularMarkerChart')
		return {
			category: ['EGFR'],
			groups: [
				{ label: 'positiv', count: [3] },
				{ label: 'negativ', count: [2] }
			]
		};
	if (name === 'getStudyPatientChart')
		return [
			{ shortname: 'SYNTH-A', studyPatients: 10 },
			{ shortname: 'SYNTH-B', studyPatients: 8 }
		];
	if (name === 'getValueOptions')
		return fields[v.collection]?.[String(v.field).replace(/^!/, '').replace('.', '_')] ?? [];
	if (/Table|AllPatient/.test(name))
		return records.slice(v.offset ?? 0, (v.offset ?? 0) + (v.limit ?? 6));
	return [];
}
function completeSelection(value, selection) {
	if (Array.isArray(value)) return value.map((item) => completeSelection(item, selection));
	if (value === null || typeof value !== 'object' || !selection) return value;
	const result = { ...value };
	for (const field of selection.selections) {
		if (field.kind !== 'Field') continue;
		const key = field.alias?.value ?? field.name.value;
		result[key] = Object.hasOwn(value, key)
			? completeSelection(value[key], field.selectionSet)
			: null;
	}
	return result;
}
await page.route('**/*', async (route) => {
	const req = route.request(),
		url = new URL(req.url());
	if (url.origin !== new URL(base).origin) return route.abort();
	if (admin && url.pathname === '/user-management' && req.isNavigationRequest())
		return route.fulfill({
			contentType: 'text/html',
			body: '<h1>Synthetic management destination</h1>'
		});
	if (url.pathname.includes('/api/keycloak/'))
		return route.fulfill({
			json: {
				active: true,
				preferred_username: stored.currentUser,
				...stored.keycloakTokens
			}
		});
	if (url.pathname === '/api/catalogue')
		return route.fulfill({
			json: {
				data: catalogue,
				revision: 'synthetic-1',
				source: 'synthetic fixture',
				timestamp: Date.now(),
				size: 10000
			}
		});
	if (url.pathname.endsWith('/graphql')) {
		const body = req.postDataJSON(),
			ast = parse(body.query),
			data = {};
		for (const def of ast.definitions)
			if (def.selectionSet)
				for (const f of def.selectionSet.selections) {
					const name = f.name.value;
					const variables = {
						...body.variables,
						...Object.fromEntries(
							(f.arguments ?? []).map((a) => [
								a.name.value,
								valueFromASTUntyped(a.value, body.variables)
							])
						)
					};
					data[f.alias?.value ?? name] = completeSelection(
						respond(name, variables),
						f.selectionSet
					);
					requests.push({ name, variables });
				}
		if (Object.hasOwn(data, 'updateUser') && body.variables?.id === 'synthetic-edit-target')
			await new Promise((resolve) => setTimeout(resolve, 800));
		if (Object.hasOwn(data, 'getValueOptions'))
			await new Promise((resolve) => setTimeout(resolve, 20));
		return route.fulfill({ json: { data } });
	}
	return route.continue();
});

// This suite uses only synthetic records and mocked local API responses. The Lens
// query store is seeded only for the explicitly labelled round-trip/pagination cases.
const metrics = {};
await page.addInitScript(() => {
	window.__editorLongTasks = [];
	new PerformanceObserver((list) => {
		for (const e of list.getEntries())
			window.__editorLongTasks.push({ start: e.startTime, duration: e.duration });
	}).observe({ type: 'longtask', buffered: true });
});
const keyInputs = () => page.locator('input[list="keyOptions"]');
const group = (index = 0) =>
	keyInputs()
		.nth(index)
		.locator(
			'xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," box_level3 ")][1]'
		);
const strings = (index = 0) => group(index).locator('input[list^="valueOptions"]');
const action = (text, scope = page) => scope.locator('button').filter({ hasText: text });
const saveButton = () => page.locator('button').filter({ has: page.locator('img[alt="save"]') });
const allValueRequests = () => requests.filter((r) => r.name === 'getValueOptions');
const snapshot = async () =>
	page.evaluate(() => {
		const lens = [...document.querySelectorAll('lens-data-passer')].find(
			(e) => typeof e.getAstAPI === 'function'
		);
		return { ast: lens?.getAstAPI(), query: lens?.getQueryAPI() };
	});
async function settle() {
	await page.waitForTimeout(230);
}
async function expectSave(enabled) {
	await settle();
	assert.equal(await saveButton().isEnabled(), enabled, 'Save eligibility');
}
async function setKey(index, key) {
	await keyInputs().nth(index).fill(key);
	await keyInputs().nth(index).press('Tab');
	await settle();
}
async function openEditor() {
	await page.locator('a[href="/filter-edit"]').first().click();
	await page.waitForURL('**/filter-edit');
	await keyInputs().first().waitFor({ timeout: 30000 });
	await settle();
}
async function leaveEditor() {
	if (new URL(page.url()).pathname === '/filter-edit') {
		await page
			.locator('button')
			.filter({ has: page.locator('img[alt="back"]') })
			.click();
		await page.waitForURL('**/patient-cohort');
		await page.locator('.filter-history-controls button').last().waitFor();
	}
}
async function fresh() {
	await leaveEditor();
	await page.locator('.filter-history-controls button').last().click();
	await settle();
	await openEditor();
}
async function save() {
	await expectSave(true);
	await saveButton().click();
	await page.waitForURL('**/patient-cohort');
	await settle();
	return snapshot();
}
function leaves(ast) {
	return !ast ? [] : ast.children ? ast.children.flatMap(leaves) : [ast];
}
function userLeaves(ast) {
	return leaves(ast).filter((r) => r.key !== 'isTumor');
}
function stripUi(value) {
	if (Array.isArray(value)) return value.map(stripUi);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !key.startsWith('_'))
				.map(([key, v]) => [key, stripUi(v)])
		);
	return value;
}
async function roundTrip(expected) {
	await openEditor();
	const saved = await save();
	assert.deepEqual(
		stripUi(saved.ast),
		stripUi(expected),
		'Save/reopen/save must preserve complete AST'
	);
	assert.ok(
		!JSON.stringify(saved.ast).includes('"_page"'),
		'UI pagination metadata is not persisted'
	);
}
async function seedRoundTrip(ast) {
	await leaveEditor();
	await page.evaluate((value) => {
		const lens = [...document.querySelectorAll('lens-data-passer')].find(
			(e) => typeof e.setQueryStoreFromAstAPI === 'function'
		);
		lens.setQueryStoreFromAstAPI(value);
	}, ast);
	await settle();
	await openEditor();
}
const leaf = (key, system, value, type = 'EQUALS') => ({ key, system, type, value });
const wrap = (items) => ({
	operand: 'OR',
	children: [{ operand: 'AND', children: [{ key: items[0].key, operand: 'OR', children: items }] }]
});
async function run(name, fn) {
	const started = performance.now(),
		before = errors.length;
	try {
		await fn();
		await settle();
		assert.deepEqual(errors.slice(before), [], 'No browser errors');
		cases.push({ name, status: 'passed', milliseconds: Math.round(performance.now() - started) });
		console.log('PASS', name);
	} catch (error) {
		cases.push({
			name,
			status: 'failed',
			error: error.stack,
			milliseconds: Math.round(performance.now() - started)
		});
		console.log('FAIL', name, error.message);
		await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
		if (!baseline) throw error;
	}
}
try {
	await page.goto(base + '/patient-cohort', { waitUntil: 'domcontentloaded', timeout: 45000 });
	await page.waitForSelector('canvas', { state: 'attached', timeout: 60000 });
	await page.waitForTimeout(900);
	if (await page.getByRole('button', { name: 'Accept', exact: true }).count())
		await page.getByRole('button', { name: 'Accept', exact: true }).click();
	await run('01-initial-editor-load-and-request-budget', async () => {
		const before = allValueRequests().length,
			start = performance.now();
		await openEditor();
		metrics.editorVisibleMs = Math.round(performance.now() - start);
		await page.waitForTimeout(3500);
		metrics.initialValueRequests = allValueRequests().slice(before);
		metrics.catalogueFields = catalogue.reduce((n, c) => n + c.childCategories.length, 0);
		metrics.initialOptionNodes = await page.locator('datalist option').count();
		metrics.initialLongTasks = await page.evaluate(() => window.__editorLongTasks);
		assert.ok(
			metrics.initialValueRequests.length <= 1,
			'Blank editor loads at most the selected default field, never all catalogue fields'
		);
		assert.equal(await keyInputs().count(), 1);
	});
	if (admin) {
		await run('admin-02-failed-save-keeps-draft', async () => {
			await page.goto(base + '/filter-edit?user=synthetic-edit-target', {
				waitUntil: 'domcontentloaded'
			});
			await keyInputs().first().waitFor();
			await page.waitForFunction(
				() => document.querySelector('input[list="keyOptions"]')?.value === 'gender(patient)'
			);
			await strings().fill('w');
			await expectSave(true);
			await saveButton().click();
			await page.waitForTimeout(120);
			assert.ok(
				page.url().includes('/filter-edit?user='),
				'No navigation before the write is acknowledged'
			);
			assert.equal(
				await saveButton().isDisabled(),
				true,
				'Duplicate save is blocked while pending'
			);
			await page
				.getByText('Der Filter konnte nicht gespeichert werden.', { exact: false })
				.waitFor();
			await page.screenshot({ path: path.join(out, 'admin-save-error.png'), fullPage: true });
			assert.equal(await strings().inputValue(), 'w', 'Failed save preserves user draft');
			assert.ok(page.url().includes('/filter-edit?user='));
			await expectSave(true);
		});
		await run('admin-03-retry-acknowledgement-and-audit-user', async () => {
			adminSaveAcknowledged = true;
			await saveButton().click();
			await page.waitForTimeout(120);
			assert.ok(page.url().includes('/filter-edit?user='));
			await page.waitForURL('**/user-management');
			const updates = requests.filter(
				(r) => r.name === 'updateUser' && r.variables.id === 'synthetic-edit-target'
			);
			assert.equal(updates.length, 2, 'Failed write followed by exactly one retry');
			const input = updates.at(-1).variables.input;
			assert.equal(
				input.lastModifiedBy,
				stored.currentUser,
				'Audit user is the logged-in administrator'
			);
			assert.equal(userLeaves(JSON.parse(input.userFilter))[0].value, 'w');
		});
	} else if (baseline) {
		await run('02-off-page-invalid-value-is-rejected', async () => {
			const values = Array.from({ length: 11 }, (_, i) =>
				leaf(
					'ageAtDiagnosis',
					'diagnosis',
					i === 10 ? { min: 80, max: 20 } : { min: i, max: i + 1 },
					'BETWEEN'
				)
			);
			await seedRoundTrip(wrap(values));
			await expectSave(false);
		});
		await run('03-malformed-key-does-not-crash', async () => {
			await fresh();
			await setKey(0, 'not-a-key');
			await expectSave(false);
		});
	} else {
		await run('02-selected-field-options-and-cache', async () => {
			const before = allValueRequests().length;
			await setKey(0, 'gender(patient)');
			await strings().fill('m');
			await expectSave(true);
			await group().locator('.operator-button').click();
			await group().locator('.operator-button').click();
			await setKey(0, 'gender(patient)');
			await strings().fill('m');
			await expectSave(true);
			metrics.genderValueRequests = allValueRequests().slice(before);
			assert.equal(
				metrics.genderValueRequests.filter(
					(r) => r.variables.field === 'gender' && r.variables.collection === 'patient'
				).length,
				1,
				'Same selected key is cached across operator/key changes'
			);
		});
		await run('03-nested-or-and-negation-save-roundtrip', async () => {
			await action('Neuen Wert hinzufügen', group()).click();
			await strings().nth(1).fill('w');
			await action('Neue Bedingung hinzufügen').first().click();
			await setKey(1, 'type(therapy)');
			await strings(1).fill('OP');
			await group(1).locator('.operator-button').click();
			await action('Neuen Wert hinzufügen', group(1)).click();
			await strings(1).nth(1).fill('ST');
			await action('Neue Gruppe hinzufügen (OR)').click();
			await setKey(2, 'ICD_ICD10_3(diagnosis)');
			await strings(2).fill('C34');
			await settle();
			await page.screenshot({ path: path.join(out, 'complex-filter-editor.png'), fullPage: true });
			const s = await save();
			assert.equal(s.ast.children.length, 2);
			assert.ok(
				userLeaves(s.ast).some((r) => r.key === '!type' && r.type === 'NEQUALS' && r.value === 'OP')
			);
			assert.ok(
				userLeaves(s.ast).some(
					(r) => r.key === '!type' && r.type === 'NEQUALS' && r.value === 'ST'
				),
				'Adding a value inherits the currently negated operator'
			);
			assert.deepEqual(
				userLeaves(s.ast)
					.filter((r) => r.key === 'gender')
					.map((r) => r.value),
				['m', 'w']
			);
			assert.ok(userLeaves(s.ast).some((r) => r.key === 'ICD_ICD10_3' && r.value === 'C34'));
			assert.ok(
				!userLeaves(s.ast).some((r) => r.key === 'ICD_ICD10Group'),
				'Mandatory lock remains outside editable query'
			);
			await roundTrip(s.ast);
		});
		await run('04-remove-one-duplicate-and-entire-groups', async () => {
			await fresh();
			await setKey(0, 'gender(patient)');
			await strings().fill('m');
			await action('Neuen Wert hinzufügen', group()).click();
			await strings().nth(1).fill('m');
			await action('Neuen Wert hinzufügen', group()).click();
			await strings().nth(2).fill('w');
			await action('Wert entfernen', group()).nth(1).click();
			assert.deepEqual(await strings().evaluateAll((els) => els.map((e) => e.value)), ['m', 'w']);
			await action('Neue Bedingung hinzufügen').first().click();
			await setKey(1, 'vitalState(patient)');
			await strings(1).fill('dead');
			await action('Kategorie entfernen', group(1)).click();
			assert.equal(await keyInputs().count(), 1);
			await action('Neue Gruppe hinzufügen (OR)').click();
			await setKey(1, 'type(therapy)');
			await strings(1).fill('ST');
			await action('Komplette Gruppe entfernen').last().click();
			assert.equal(await keyInputs().count(), 1);
			const s = await save();
			assert.deepEqual(
				userLeaves(s.ast).map((r) => r.value),
				['m', 'w']
			);
		});
		await run('05-date-bounds-negation-and-roundtrip', async () => {
			await fresh();
			await setKey(0, 'diagnosisDate(diagnosis)');
			const dates = group().locator('input[type="date"]');
			await dates.nth(0).fill('2024-03-31');
			await dates.nth(1).fill('2024-10-27');
			await group().locator('.operator-button').click();
			const s = await save();
			const row = userLeaves(s.ast)[0];
			assert.equal(row.type, 'NBETWEEN');
			assert.equal(row.key, '!diagnosisDate');
			await openEditor();
			assert.deepEqual(
				await group()
					.locator('input[type="date"]')
					.evaluateAll((els) => els.map((e) => e.value)),
				['2024-03-31', '2024-10-27']
			);
			const saved = await save();
			assert.deepEqual(stripUi(saved.ast), stripUi(s.ast));
		});
		await run('06-date-missing-and-open-bound', async () => {
			await fresh();
			await setKey(0, 'diagnosisDate(diagnosis)');
			await action('Feld leeren', group()).click();
			let s = await save();
			assert.deepEqual(userLeaves(s.ast)[0].value, { min: null, max: null });
			await openEditor();
			await group().locator('input[type="date"]').nth(0).fill('2024-01-01');
			s = await save();
			assert.equal(userLeaves(s.ast)[0].value.max, null);
			assert.ok(Number.isFinite(userLeaves(s.ast)[0].value.min));
			await roundTrip(s.ast);
		});
		await run('07-reversed-date-and-number-ranges-block-save', async () => {
			await fresh();
			await setKey(0, 'diagnosisDate(diagnosis)');
			await group().locator('input[type="date"]').nth(0).fill('2025-01-01');
			await group().locator('input[type="date"]').nth(1).fill('2024-12-31');
			await expectSave(false);
			await setKey(0, 'ageAtDiagnosis(diagnosis)');
			const nums = group().locator('input[type="number"]');
			await nums.nth(0).fill('80');
			await nums.nth(1).fill('20');
			await expectSave(false);
			await nums.nth(0).fill('');
			await nums.nth(0).pressSequentially('1e');
			assert.equal(await nums.nth(0).evaluate((input) => input.validity.badInput), true);
			await expectSave(false);
			await nums.nth(0).press('Control+A');
			await nums.nth(0).press('Backspace');
			assert.equal(await nums.nth(0).evaluate((input) => input.validity.badInput), false);
			await expectSave(true);
			await nums.nth(0).fill('0.25');
			await nums.nth(1).fill('12.5');
			await expectSave(true);
			const fractional = await save();
			assert.deepEqual(userLeaves(fractional.ast)[0].value, { min: 0.25, max: 12.5 });
			await roundTrip(fractional.ast);
			await openEditor();
			assert.deepEqual(await nums.evaluateAll((inputs) => inputs.map((input) => input.value)), [
				'0.25',
				'12.5'
			]);
			await nums.nth(0).fill('0');
			await nums.nth(1).fill('0');
			let s = await save();
			assert.deepEqual(userLeaves(s.ast)[0].value, { min: 0, max: 0 });
			await roundTrip(s.ast);
			await openEditor();
			await action('Feld leeren', group()).click();
			s = await save();
			assert.deepEqual(userLeaves(s.ast)[0].value, { min: null, max: null });
		});
		await run('08-empty-string-sentinel-and-invalid-key', async () => {
			await fresh();
			await setKey(0, 'gender(patient)');
			await strings().fill('');
			let emptyState = await save();
			assert.equal(userLeaves(emptyState.ast)[0].value, '', 'Explicit empty scalar is retained');
			await roundTrip(emptyState.ast);
			await openEditor();
			await strings().fill('not-in-options');
			await expectSave(true);
			const customState = await save();
			assert.equal(
				userLeaves(customState.ast)[0].value,
				'not-in-options',
				'Suggestions do not constrain stored scalar values'
			);
			await openEditor();
			await action('Feld leeren', group()).click();
			const s = await save();
			assert.equal(userLeaves(s.ast)[0].value, '-');
			await openEditor();
			await setKey(0, 'not-a-key');
			await expectSave(false);
			await setKey(0, 'unknown(patient)');
			await expectSave(false);
			await setKey(0, 'gender(patient)');
			await strings().fill('w');
			await expectSave(true);
			await save();
		});
		await run('09-pagination-roundtrip-offpage-values', async () => {
			const original = wrap(
				Array.from({ length: 23 }, (_, i) => leaf('patID', 'patient', 'SYNTHETIC-' + (i + 1)))
			);
			await seedRoundTrip(original);
			assert.equal(await strings().count(), 10);
			assert.match(await group().locator('.inneror-pagination').innerText(), /1-10 von 23/);
			await group().getByRole('button', { name: '▶', exact: true }).click();
			assert.equal(await strings().count(), 10);
			await group().getByRole('button', { name: '▶', exact: true }).click();
			assert.equal(await strings().count(), 3);
			await strings().nth(1).fill('SYNTHETIC-40');
			const s = await save();
			assert.equal(userLeaves(s.ast).length, 23);
			assert.equal(userLeaves(s.ast)[21].value, 'SYNTHETIC-40');
			assert.equal(userLeaves(s.ast)[0].value, 'SYNTHETIC-1');
			assert.ok(!JSON.stringify(s.ast).includes('"_page"'));
			await roundTrip(s.ast);
		});
		await run('10-offpage-invalid-values-cannot-save', async () => {
			const original = wrap(
				Array.from({ length: 11 }, (_, i) =>
					leaf(
						'ageAtDiagnosis',
						'diagnosis',
						i === 10 ? { min: 80, max: 20 } : { min: i, max: i + 1 },
						'BETWEEN'
					)
				)
			);
			await seedRoundTrip(original);
			assert.equal(await group().locator('input[type=number]').count(), 20);
			await expectSave(false);
			await group().getByRole('button', { name: '▶', exact: true }).click();
			await group().locator('input[type=number]').nth(0).fill('10');
			await expectSave(true);
			await group().getByRole('button', { name: '◀', exact: true }).click();
			await expectSave(true);
			await save();
		});
		await run('11-add-eleventh-value-reveals-new-page', async () => {
			await seedRoundTrip(
				wrap(Array.from({ length: 10 }, (_, i) => leaf('patID', 'patient', 'SYNTHETIC-' + (i + 1))))
			);
			await action('Neuen Wert hinzufügen', group()).click();
			assert.equal(await strings().count(), 1, 'Newly added 11th value is immediately visible');
			assert.equal(await strings().inputValue(), '');
			await expectSave(true);
			await strings().fill('SYNTHETIC-11');
			await action('Wert entfernen', group()).click();
			assert.equal(await strings().count(), 10, 'Deleting last page clamps to previous page');
			await expectSave(true);
			const s = await save();
			assert.equal(userLeaves(s.ast).length, 10);
		});
		await run('12-large-roundtrip-render-budget', async () => {
			const original = wrap(
				Array.from({ length: 2000 }, (_, i) =>
					leaf('patID', 'patient', 'SYNTHETIC-' + ((i % 40) + 1))
				)
			);
			const before = allValueRequests().length,
				start = performance.now();
			await seedRoundTrip(original);
			metrics.largeEditorVisibleMs = Math.round(performance.now() - start);
			assert.equal(await strings().count(), 10, 'Large selections render one page');
			const keyLists = await page.locator('datalist[id="keyOptions"]').count();
			assert.equal(keyLists, 1, 'Catalogue datalist is rendered once');
			metrics.largeValueOptionNodes = await group().locator('datalist option').count();
			assert.ok(
				metrics.largeValueOptionNodes <= 40,
				'One value options datalist is shared by visible values'
			);
			assert.ok(
				allValueRequests().length - before <= 1,
				'Large selection loads its single field only'
			);
			await group().getByRole('button', { name: '▶', exact: true }).click();
			const s = await save();
			assert.equal(userLeaves(s.ast).length, 2000);
			assert.deepEqual(userLeaves(s.ast), original.children[0].children[0].children);
		});
		await run('13-date-metadata-without-date-in-key', async () => {
			await fresh();
			await setKey(0, 'start(study)');
			const dates = group().locator('input[type="date"]');
			assert.equal(
				await dates.count(),
				2,
				'Date widgets follow catalogue metadata, including start'
			);
			await dates.nth(0).fill('2024-01-01');
			await dates.nth(1).fill('2024-12-31');
			const s = await save();
			await roundTrip(s.ast);
		});
		await run('14-same-key-different-collections', async () => {
			await fresh();
			await setKey(0, 'type(therapy)');
			await strings().fill('OP');
			await action('Neue Bedingung hinzufügen').first().click();
			await setKey(1, 'type(molecularMarker)');
			await strings(1).fill('EGFR');
			assert.notEqual(await strings().getAttribute('list'), await strings(1).getAttribute('list'));
			const s = await save();
			assert.ok(
				userLeaves(s.ast).some(
					(r) => r.key === 'type' && r.system === 'therapy' && r.value === 'OP'
				)
			);
			assert.ok(
				userLeaves(s.ast).some(
					(r) => r.key === 'type' && r.system === 'molecularMarker' && r.value === 'EGFR'
				)
			);
			await roundTrip(s.ast);
		});
		await run('15-mandatory-lock-preserved', async () => {
			const actual = JSON.parse(await page.evaluate(() => localStorage.getItem('loggedInUser')));
			assert.equal(actual.currentFilter, stored.currentFilter);
			const filtered = requests.filter((r) => typeof r.variables?.filter === 'string');
			assert.ok(filtered.length > 10);
			if (restricted)
				assert.ok(
					filtered.every((r) => r.variables.filter.includes('C30-C39')),
					'All data queries preserve assigned mandatory scope'
				);
			await openEditor();
			assert.ok(
				!(await keyInputs().evaluateAll((els) => els.map((e) => e.value))).includes(
					'ICD_ICD10Group(diagnosis)'
				)
			);
		});
		await run('16-normal-user-cannot-edit-assigned-permissions', async () => {
			await page.goto(base + '/filter-edit?user=synthetic-edit-target', {
				waitUntil: 'domcontentloaded'
			});
			await page
				.getByText('you do not have permission to change specific user permissions', {
					exact: false
				})
				.waitFor();
			assert.equal(await keyInputs().count(), 0);
			assert.equal(
				requests.filter(
					(r) => r.name === 'updateUser' && r.variables.id === 'synthetic-edit-target'
				).length,
				0
			);
		});
		assert.deepEqual(errors, [], 'No browser errors over the complete suite');
	}
} finally {
	metrics.longTasks = await page.evaluate(() => window.__editorLongTasks).catch(() => []);
	await page.screenshot({ path: path.join(out, 'final.png'), fullPage: true }).catch(() => {});
	fs.writeFileSync(
		path.join(out, 'results.json'),
		JSON.stringify({ baseline, restricted, admin, cases, errors, metrics, requests }, null, 2)
	);
	await browser.close();
}
if (cases.some((c) => c.status === 'failed')) process.exitCode = 1;
console.log('FINAL', JSON.stringify({ cases, metrics }, null, 2));
