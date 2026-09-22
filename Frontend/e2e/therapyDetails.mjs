import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OVIS_PLAYWRIGHT_MODULE || 'playwright');
const { parse, valueFromASTUntyped } = require(process.env.OVIS_GRAPHQL_MODULE || 'graphql');
const base = process.env.OVIS_TEST_URL || 'http://127.0.0.1:5189';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname));
const out = path.resolve(process.env.OVIS_TEST_OUTPUT || 'therapy-details-results');
fs.mkdirSync(out, { recursive: true });
const cases = [],
	errors = [],
	requests = [],
	blockedOrigins = [],
	consoleMessages = [];
const pendingRequests = new Set();
const assigned = {
	operand: 'AND',
	children: [{ key: 'gender', system: 'patient', type: 'EQUALS', value: 'w' }]
};
const stored = {
	currentUser: 'synthetic-therapy-test',
	currentRole: 'user',
	currentLanguage: 'de',
	currentTheme: false,
	primaryColorRGB: { r: 0, g: 128, b: 80 },
	primaryColor: '#008050',
	colorPalette: ['#008050', '#229966', '#55bb99', '#9acdb7'],
	paletteName: 'CCCMunich',
	darkMode: false,
	chartShowTop5: false,
	chartHideNullValues: false,
	pseudonymization: false,
	currentFilter: JSON.stringify(assigned),
	keycloakTokens: {
		access_token: 'synthetic-local-token',
		refresh_token: 'synthetic-local-refresh',
		expires_in: 36000,
		timestamp: Date.now()
	}
};
const common = {
	gender: 'w',
	isTumor: true,
	therapyEndDate: Date.UTC(2026, 1, 17),
	status: 'Durchgeführt',
	intention: 'palliativ',
	organizationalUnit: 'Synthetische Testklinik'
};
const records = [
	...Array.from({ length: 13 }, (_, i) => ({
		...common,
		_id: `synthetic-nuclear-${i}`,
		therapyID: `SYN-N-${String(i + 1).padStart(2, '0')}`,
		patID: `SYN-PN-${i}`,
		tumorID: `SYN-TN-${i}`,
		generalType: 'nuclear',
		therapyOccurrenceDate: Date.UTC(2026, 0, i + 1),
		therapyDaysSinceDiagnosis: 30 + i,
		subType:
			i === 12
				? 'Altimport ohne Zusatzfelder'
				: i === 2
				? 'sonstige metabolische Radionuklidtherapie'
				: i % 2
				? 'PSMA-Therapie'
				: 'Peptid-Radio-Rezeptor-Therapie',
		subTypeCode: i === 12 ? null : i === 2 ? 'M' : i % 2 ? 'MPSMA' : 'MPRRT',
		subTypeDetail: i === 2 ? 'Xofigo-Therapie' : null,
		subTypeDetailCode: i === 2 ? 'XOFIGO' : null,
		radioNuclid:
			i === 12
				? null
				: i === 2
				? 'Radium (Ra-223)'
				: i % 2
				? 'Actinium (Ac-225)'
				: 'Lutetium (Lu-177)',
		radioNuclidCode: i === 12 ? null : i === 2 ? 'Ra-223' : i % 2 ? 'Ac-225' : 'Lu-177',
		radiopharmaceutical: i % 2 || i === 12 || i === 2 ? null : 'DOTA-TATE',
		radiopharmaceuticalCode: i % 2 || i === 12 || i === 2 ? null : 'DOTA-TATE'
	})),
	...Array.from({ length: 8 }, (_, i) => ({
		...common,
		_id: `synthetic-other-${i}`,
		therapyID: `SYN-O-${String(i + 1).padStart(2, '0')}`,
		patID: `SYN-PO-${i}`,
		tumorID: `SYN-TO-${i}`,
		generalType: 'other',
		therapyOccurrenceDate: Date.UTC(2026, 0, i + 1),
		therapyDaysSinceDiagnosis: 60 + i,
		subType:
			i === 7
				? 'Altimport ohne Zusatzfelder'
				: i === 2
				? 'Andere Therapie'
				: i % 2
				? 'Radiofrequenzablation'
				: 'Transarterielle Chemoembolisation',
		subTypeCode: i === 7 ? null : i === 2 ? 'A' : i % 2 ? 'RFA' : 'TACE',
		subTypeDetail: i === 2 ? 'nicht näher bezeichnet' : null,
		subTypeDetailCode: i === 2 ? 'nbz' : null,
		radioNuclid: null,
		radioNuclidCode: null,
		radiopharmaceutical: null,
		radiopharmaceuticalCode: null
	})),
	...['nuclear', 'other', 'systemic', 'radiation'].map((type, i) => ({
		...common,
		_id: `synthetic-excluded-${i}`,
		therapyID: `EXCLUDED-${type}`,
		patID: `EXCLUDED-P${i}`,
		tumorID: `EXCLUDED-T${i}`,
		generalType: type,
		gender: i < 2 ? 'm' : 'w',
		subType: 'Must not appear',
		subTypeCode: 'EXCLUDED',
		therapyOccurrenceDate: Date.UTC(2026, 0, 20),
		therapyDaysSinceDiagnosis: 99
	}))
];

function matches(row, node) {
	if (!node || (node.children && !node.children.length)) return true;
	if (node.children)
		return node.operand === 'OR'
			? node.children.some((child) => matches(row, child))
			: node.children.every((child) => matches(row, child));
	assert.equal(node.type, 'EQUALS', `Fixture supports equality, received ${node.type}`);
	assert.ok(
		[
			'gender',
			'generalType',
			'subType',
			'subTypeCode',
			'subTypeDetail',
			'radioNuclid',
			'status',
			'isTumor'
		].includes(node.key),
		`Unexpected filter field ${node.key}`
	);
	if (node.key === 'isTumor') return String(row.isTumor) === String(node.value);
	return row[node.key] === node.value;
}
function matchingRows(args) {
	const rows = records.filter(
		(row) =>
			matches(row, args.filter ? JSON.parse(args.filter) : null) &&
			(args.columnFilters || []).every(({ field, value }) =>
				String(row[field] ?? '')
					.toLowerCase()
					.includes(String(value).toLowerCase())
			)
	);
	if (args.sortField)
		rows.sort((a, b) => {
			const left = a[args.sortField] ?? '',
				right = b[args.sortField] ?? '';
			return (left < right ? -1 : left > right ? 1 : 0) * (args.sortDirection === 'desc' ? -1 : 1);
		});
	return rows;
}
function respond(name, args) {
	if (name === 'getPlatformConfiguration')
		return {
			colorTheme: 'CCCMunich',
			colorPalette: stored.colorPalette,
			systemLanguage: 'de',
			source: 'TEST',
			documents: []
		};
	if (name === 'getUser')
		return [
			{
				_id: stored.currentUser,
				role: 'user',
				status: 'active',
				language: 'de',
				firstLogin: Date.now(),
				darkMode: false,
				userFilter: [stored.currentFilter],
				filter: stored.currentFilter
			}
		];
	if (name === 'getLastMetaData') return { executedAt: Date.now() };
	if (name.startsWith('update') || name === 'recordUsageEvents') return { acknowledged: true };
	if (
		name === 'getQuicktoolsBasicsIcd10' ||
		name === 'getQuicktoolsBasicsHistology' ||
		name === 'getValueOptions'
	)
		return [];
	if (name === 'getQuicktoolsCountOverview')
		return ['patient', 'diagnosis', 'therapy', 'progress'].map((collection) => ({
			collection,
			count: matchingRows(args).length
		}));
	if (name === 'getTableCount') return matchingRows(args).length;
	if (name === 'getAllTherapies')
		return matchingRows(args).slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 100));
	if (name === 'getCategoryChart') {
		const counts = new Map();
		for (const row of matchingRows(args)) {
			const label = row[args.selectedType] ?? null;
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}
		return { label: [...counts.keys()], count: [...counts.values()] };
	}
	return [];
}
function completeSelection(value, selection) {
	if (Array.isArray(value)) return value.map((item) => completeSelection(item, selection));
	if (value === null || typeof value !== 'object' || !selection) return value;
	const result = {};
	for (const field of selection.selections) {
		if (field.kind !== 'Field') continue;
		const key = field.alias?.value ?? field.name.value;
		result[key] = Object.hasOwn(value, field.name.value)
			? completeSelection(value[field.name.value], field.selectionSet)
			: null;
	}
	return result;
}
const browser = await chromium.launch({
	headless: true,
	...(process.env.OVIS_CHROMIUM ? { executablePath: process.env.OVIS_CHROMIUM } : {})
});
const context = await browser.newContext({
	viewport: { width: 1900, height: 1050 },
	timezoneId: 'Europe/Berlin',
	locale: 'de-DE',
	acceptDownloads: true
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', (error) => errors.push(error.stack));
page.on('console', (message) =>
	consoleMessages.push({ type: message.type(), text: message.text() })
);
page.on('request', (request) => pendingRequests.add(request.url()));
page.on('requestfinished', (request) => pendingRequests.delete(request.url()));
page.on('requestfailed', (request) => pendingRequests.delete(request.url()));
page.on('dialog', (dialog) => {
	errors.push(dialog.message());
	void dialog.dismiss();
});
await page.addInitScript((value) => {
	localStorage.setItem('loggedInUser', JSON.stringify(value));
	// Use the application's normal browser-download fallback, avoiding a native file picker.
	Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
}, stored);
await page.route('**/*', async (route) => {
	const request = route.request(),
		url = new URL(request.url());
	if (url.origin !== new URL(base).origin) {
		blockedOrigins.push(url.origin);
		return route.abort();
	}
	if (url.pathname.includes('/api/keycloak/'))
		return route.fulfill({
			json: { active: true, preferred_username: stored.currentUser, ...stored.keycloakTokens }
		});
	if (url.pathname === '/api/catalogue')
		return route.fulfill({
			json: {
				data: [],
				revision: 'synthetic-therapy-1',
				source: 'synthetic fixture',
				timestamp: Date.now(),
				size: 0
			}
		});
	if (url.pathname.endsWith('/graphql')) {
		const body = request.postDataJSON(),
			data = {};
		for (const definition of parse(body.query).definitions)
			for (const field of definition.selectionSet?.selections ?? []) {
				const name = field.name.value;
				const args = Object.fromEntries(
					(field.arguments ?? []).map((argument) => [
						argument.name.value,
						valueFromASTUntyped(argument.value, body.variables)
					])
				);
				const response = respond(name, args);
				requests.push({ name, args, response, at: Date.now() });
				data[field.alias?.value ?? name] = completeSelection(response, field.selectionSet);
			}
		return route.fulfill({ json: { data } });
	}
	if (url.pathname.startsWith('/api/')) {
		errors.push(`Unmocked API request: ${url.pathname}`);
		return route.abort();
	}
	return route.continue();
});

function lastTableRequest() {
	return requests.filter((request) => request.name === 'getAllTherapies').at(-1);
}
function assertScope(request, type) {
	const filter = JSON.parse(request.args.filter);
	const sample = records.find(
		(row) => row.generalType === type && row.gender === 'w' && matches(row, filter)
	);
	assert.ok(sample, 'Matching therapy and patient remain included');
	assert.ok(
		!matches({ ...sample, generalType: type === 'nuclear' ? 'other' : 'nuclear' }, filter),
		'Different therapy type is excluded'
	);
	assert.ok(
		!matches({ ...sample, gender: 'm' }, filter),
		'Assigned patient restriction is retained'
	);
}
async function seedMixedTherapySelection() {
	// Fixture setup only: interactions under test still click rendered cells.
	await page.evaluate(() => {
		const lens = [...document.querySelectorAll('lens-data-passer')].find(
			(element) => typeof element.setQueryStoreFromAstAPI === 'function'
		);
		lens.setQueryStoreFromAstAPI({
			operand: 'OR',
			children: [
				{
					operand: 'AND',
					children: [
						{
							key: 'generalType',
							operand: 'OR',
							children: ['nuclear', 'other'].map((value) => ({
								key: 'generalType',
								system: 'therapy',
								type: 'EQUALS',
								value
							}))
						}
					]
				}
			]
		});
	});
	await page.waitForTimeout(450);
}
async function assertClickedSelection(type, field, value) {
	await page.waitForFunction(
		({ type, field, value }) => {
			const lens = [...document.querySelectorAll('lens-data-passer')].find(
				(element) => typeof element.getQueryAPI === 'function'
			);
			if (!lens) return false;
			const rows = lens.getQueryAPI().flat();
			const scope = rows.find((row) => row.key === 'generalType' && row.system === 'therapy');
			const selected = rows.find((row) => row.key === field && row.system === 'therapy');
			return (
				scope?.values.length === 1 &&
				scope.values[0].value === type &&
				selected?.values.some((item) => item.value === value)
			);
		},
		{ type, field, value }
	);
	await page.waitForTimeout(450);
	assertScope(lastTableRequest(), type);
}
async function resetPersonalFilter() {
	await page.locator('.filter-history-controls button').last().click();
	await page.waitForTimeout(450);
}
function expectedHeaders(type) {
	return [
		'ID',
		'PID',
		'TID',
		'Beginn',
		'Ende',
		'TsD',
		'Art',
		'Art-Code',
		...(type === 'nuclear' ? ['Nuklid', 'Nukl.-Code', 'Radioph.', 'Rph.-Code'] : [])
	];
}
async function tableSnapshot(type, id) {
	await page.locator(`#${id}_info`).waitFor();
	await page.waitForTimeout(450);
	const request = lastTableRequest();
	assertScope(request, type);
	const displayed = (
		await page
			.locator(`#${id} tbody tr:not(:has(td.dataTables_empty)) td:first-child`)
			.allTextContents()
	).map((text) => text.match(/SYN-[NO]-\d+/)?.[0] ?? text.trim());
	assert.deepEqual(
		displayed,
		request.response.map((row) => row.therapyID)
	);
	const daysSinceDiagnosis = await page
		.locator(`#${id} tbody tr:not(:has(td.dataTables_empty)) td:nth-child(6)`)
		.allTextContents();
	assert.deepEqual(
		daysSinceDiagnosis.map((text) => text.trim()),
		request.response.map((row) => String(row.therapyDaysSinceDiagnosis)),
		'TsD values are displayed in the retained date/detail columns'
	);
	const info = await page.locator(`#${id}_info`).innerText();
	assert.ok(info.includes(String(matchingRows(request.args).length)), `Count shown: ${info}`);
	assert.ok(!(await page.locator('.therapy-details').innerText()).includes('EXCLUDED'));
	return { rows: displayed.length, info, limit: request.args.limit };
}
async function togglePanel(panel) {
	await panel
		.locator('button')
		.filter({ has: page.locator('img[src*="window-maximize"], img[src*="window-minimize"]') })
		.click();
}
async function stableChart() {
	await page.mouse.move(1450, 930);
	await page.waitForTimeout(1300);
	await page.waitForFunction(() => {
		const canvas = document.querySelector('.category-panel canvas');
		if (!canvas || !canvas.width || !canvas.height) return false;
		const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
		let colored = 0;
		for (let index = 0; index < pixels.length; index += 4) {
			if (
				pixels[index + 3] > 150 &&
				Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) -
					Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) >
					30
			)
				colored++;
		}
		return colored > 1500; // More painted pixels than legend swatches alone.
	});
}
async function exportCsv(type, id, suffix = '') {
	await page.waitForTimeout(1000); // Let the keyup debounce and table resize settle.
	await page.waitForFunction(() => {
		const button = document.querySelector('.table-panel .table-export button');
		return button && !button.disabled && button.getAttribute('aria-busy') === 'false';
	});
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30000 }),
		page.locator('.table-panel').getByRole('button', { name: 'CSV-Datei herunterladen' }).click()
	]);
	const filename = path.join(out, `${type}${suffix}.csv`);
	await download.saveAs(filename);
	const content = fs.readFileSync(filename, 'utf8');
	const csvLines = content
		.replace(/^\uFEFF/, '')
		.trim()
		.split(/\r?\n/);
	assert.deepEqual(
		csvLines[0].split(';'),
		['_id', ...expectedHeaders(type)],
		'CSV retains dates and TsD and omits detail labels, detail codes and general-only fields'
	);
	const request = lastTableRequest();
	assertScope(request, type);
	const expected = matchingRows(request.args);
	assert.equal(content.trim().split('\n').length - 1, expected.length);
	const csvRowsById = new Map(
		csvLines.slice(1).map((line) => {
			const cells = line.split(';');
			return [cells[1], cells];
		})
	);
	for (const row of expected) {
		assert.equal(
			csvRowsById.get(row.therapyID)[6],
			String(row.therapyDaysSinceDiagnosis),
			`CSV preserves TsD for ${row.therapyID}`
		);
		for (const value of [
			row.therapyID,
			row.subType,
			row.subTypeCode,
			...(type === 'nuclear'
				? [
						row.radioNuclid,
						row.radioNuclidCode,
						row.radiopharmaceutical,
						row.radiopharmaceuticalCode
				  ]
				: [])
		]) {
			if (value) assert.ok(content.includes(value), `CSV preserves ${value}`);
		}
	}
	assert.ok(!content.includes('EXCLUDED'));
	assert.ok(!content.includes('undefined') && !content.includes(';null;'));
	assert.ok(content.includes('Art-Code'));
	if (type === 'nuclear')
		assert.ok(content.includes('Nukl.-Code') && content.includes('Rph.-Code'));
	cases.push({ name: `${type}-csv${suffix}`, rows: expected.length, filename });
}
async function run(type) {
	const id = `generic_therapy${type === 'nuclear' ? 'Nuclear' : 'Other'}Table`;
	const start = requests.length;
	await page
		.locator('.navbar button')
		.filter({ has: page.locator('img[alt="therapy-general"]') })
		.hover();
	await page.locator(`.navbar a[href="therapy-${type}"]`).click();
	await page.waitForURL(`**/therapy-${type}`);
	await page.mouse.move(1450, 930);
	const normal = await tableSnapshot(type, id);
	const chart = page.locator('.category-panel'),
		table = page.locator('.table-panel');
	const tableHeader = page.locator(`#${id} thead tr`).first().locator('th');
	assert.deepEqual(
		(await tableHeader.allTextContents()).map((text) => text.trim()),
		expectedHeaders(type),
		'Detail headers retain dates and TsD and omit detail labels, detail codes and general-only fields'
	);
	assert.equal(lastTableRequest().args.sortField, 'therapyOccurrenceDate');
	await chart.locator('canvas').waitFor({ state: 'visible' });
	assert.equal(matchingRows(lastTableRequest().args).length, type === 'nuclear' ? 13 : 8);
	await stableChart();
	await page.screenshot({ path: path.join(out, `${type}-overview-de.png`), fullPage: true });
	cases.push({ name: `${type}-navigation-and-scoped-table`, ...normal });
	await exportCsv(type, id);
	await togglePanel(table);
	const maximized = await tableSnapshot(type, id);
	assert.ok(maximized.limit > normal.limit, 'Maximize increases table page capacity');
	assert.ok(!(await chart.isVisible()), 'Table maximize hides chart');
	await page.screenshot({ path: path.join(out, `${type}-table-maximized-de.png`), fullPage: true });
	await togglePanel(table);
	const restored = await tableSnapshot(type, id);
	assert.equal(restored.limit, normal.limit);
	cases.push({ name: `${type}-maximize-restore`, normal, maximized, restored });
	await tableHeader.nth(6).click();
	await tableSnapshot(type, id);
	assert.equal(lastTableRequest().args.sortField, 'subType');
	const firstDirection = lastTableRequest().args.sortDirection;
	await tableHeader.nth(6).click();
	await tableSnapshot(type, id);
	assert.notEqual(lastTableRequest().args.sortDirection, firstDirection);
	cases.push({ name: `${type}-sort-label-both-directions` });
	const input = page.locator(`#${id} thead input`).nth(7);
	await input.fill(type === 'nuclear' ? 'MPRRT' : 'TACE');
	await input.press('Tab');
	await tableSnapshot(type, id);
	assert.ok(lastTableRequest().args.columnFilters.some((filter) => filter.field === 'subTypeCode'));
	await exportCsv(type, id, '-filtered');
	await input.fill('NO-SYNTHETIC-MATCH');
	await input.press('Tab');
	await tableSnapshot(type, id);
	assert.equal(lastTableRequest().response.length, 0);
	cases.push({ name: `${type}-code-filter-and-zero-results` });
	await input.fill('');
	await input.press('Tab');
	await tableSnapshot(type, id);
	const legacyInput = page.locator(`#${id} thead input`).nth(6);
	await legacyInput.fill('Altimport');
	await legacyInput.press('Tab');
	await tableSnapshot(type, id);
	assert.equal(lastTableRequest().response.length, 1);
	const legacyCells = await page.locator(`#${id} tbody tr`).first().locator('td').allTextContents();
	assert.equal(legacyCells[7].trim(), '');
	if (type === 'nuclear') assert.equal(legacyCells[8].trim(), '');
	cases.push({ name: `${type}-legacy-empty-fields` });
	await legacyInput.fill('');
	await legacyInput.press('Tab');
	await tableSnapshot(type, id);
	for (const field of type === 'nuclear'
		? ['radioNuclid', 'radiopharmaceutical', 'subTypeDetail']
		: ['subTypeDetail']) {
		await chart.locator('select').selectOption(field);
		await page.waitForTimeout(450);
		const request = requests.filter((entry) => entry.name === 'getCategoryChart').at(-1);
		assert.equal(request.args.selectedType, field);
		assertScope(request, type);
		assert.equal(
			request.response.count.reduce((sum, count) => sum + count, 0),
			type === 'nuclear' ? 13 : 8
		);
		await chart.locator('canvas').waitFor({ state: 'visible' });
		await chart
			.locator('button')
			.filter({ has: page.locator('img[src$="/table.svg"]') })
			.click();
		await chart.locator('table:visible').waitFor();
		const text = await chart.locator('table:visible').innerText();
		for (const label of request.response.label.filter(Boolean))
			assert.ok(text.includes(label), `Chart table renders ${label}`);
		assert.ok(!text.includes('EXCLUDED'));
		await chart
			.locator('button')
			.filter({ has: page.locator('img[src$="/chart-bar.svg"]') })
			.click();
		await stableChart();
		await page.screenshot({
			path: path.join(out, `${type}-${field}-chart-de.png`),
			fullPage: true
		});
		cases.push({ name: `${type}-chart-${field}`, response: request.response });
	}
	await chart.locator('select').selectOption('subType');
	await page.waitForTimeout(400);
	await seedMixedTherapySelection();
	await chart
		.locator('button')
		.filter({ has: page.locator('img[src$="/table.svg"]') })
		.click();
	const selectedLabel = type === 'nuclear' ? 'PSMA-Therapie' : 'Transarterielle Chemoembolisation';
	await chart.locator('table:visible td').getByText(selectedLabel, { exact: true }).click();
	await assertClickedSelection(type, 'subType', selectedLabel);
	cases.push({ name: `${type}-chart-table-click-replaces-mixed-scope` });
	await resetPersonalFilter();
	await chart
		.locator('button')
		.filter({ has: page.locator('img[src$="/chart-bar.svg"]') })
		.click();
	await seedMixedTherapySelection();
	await togglePanel(table);
	await tableSnapshot(type, id);
	const codeCell = page
		.locator(`#${id} tbody tr td:nth-child(8)`)
		.filter({ hasText: /\S/ })
		.first();
	const selectedCode = (await codeCell.innerText()).trim();
	assert.ok(selectedCode, 'Click a populated therapy type code');
	await codeCell.click();
	await assertClickedSelection(type, 'subTypeCode', selectedCode);
	cases.push({ name: `${type}-detail-table-click-replaces-mixed-scope` });
	await resetPersonalFilter();
	await togglePanel(table);
	await tableSnapshot(type, id);
	for (const request of requests
		.slice(start)
		.filter((entry) =>
			['getAllTherapies', 'getTableCount', 'getCategoryChart'].includes(entry.name)
		))
		assertScope(request, type);
}
let failure;
try {
	const diagnostic = process.argv.includes('--diagnostic-general');
	await page.goto(base + (diagnostic ? '/therapy-general' : '/therapy-other'), {
		waitUntil: 'domcontentloaded',
		timeout: 60000
	});
	await page
		.locator(diagnostic ? '#generic_therapyGeneralTable_info' : '#generic_therapyOtherTable_info')
		.waitFor();
	const accept = page.getByRole('button', { name: /Akzeptieren|Accept/ });
	if (await accept.count()) await accept.click();
	if (diagnostic)
		await page.screenshot({ path: path.join(out, 'diagnostic-general.png'), fullPage: true });
	else {
		if (!process.argv.includes('--only-other')) await run('nuclear');
		await run('other');
	}
	assert.deepEqual(errors, []);
} catch (error) {
	failure = error;
	await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
	fs.writeFileSync(path.join(out, 'failure-dom.txt'), await page.locator('body').innerText());
} finally {
	fs.writeFileSync(
		path.join(out, 'report.json'),
		JSON.stringify(
			{
				base,
				synthetic: true,
				passed: !failure,
				failure: failure?.stack,
				cases,
				errors,
				blockedOrigins,
				consoleMessages,
				pendingRequests: [...pendingRequests],
				requests
			},
			null,
			2
		)
	);
	await browser.close();
}
if (failure) throw failure;
console.log(`PASS ${cases.length} therapy detail scenarios; reports in ${out}`);
