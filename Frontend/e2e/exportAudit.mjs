import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OVIS_PLAYWRIGHT_MODULE || 'playwright');
const { parse, valueFromASTUntyped } = require(process.env.OVIS_GRAPHQL_MODULE || 'graphql');
const xlsx = require('xlsx');
const fixtureBuild = await build({
	stdin: {
		contents:
			"export { exportBuilderRows } from './fixtures/export-builder-rows.ts'; export { datasets } from '../src/lib/export-builder/model.ts'; export { default as translations } from '../src/store/translations.js';",
		resolveDir: fileURLToPath(new URL('.', import.meta.url))
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node'
});
const { exportBuilderRows, datasets, translations } = await import(
	`data:text/javascript;base64,${Buffer.from(fixtureBuild.outputFiles[0].text).toString('base64')}`
);
const endpoints = {
	getAllPatient: 'patient',
	getFirstAssessment: 'diagnosis',
	getAllTherapies: 'therapy',
	getTherapyRadiationTable: 'radiation',
	getDiagnosisHistologyTable: 'histology',
	getTnmMetastases: 'tnm',
	getCourses: 'progress',
	getTNMMetastasisTable: 'metastasis',
	getTumorBoard: 'tumorBoard',
	getConsultation: 'consultation',
	getStatus: 'status',
	getMolecularMarker: 'molecularMarker',
	getBioMaterial: 'bioMaterial',
	getStudyPatientTable: 'studyPatient',
	getSupplementary: 'supplementary'
};
const base = process.env.OVIS_TEST_URL || 'http://127.0.0.1:5193';
assert.ok(
	['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname),
	'Only a local isolated app is supported'
);
const out = path.resolve(process.env.OVIS_TEST_OUTPUT || 'export-audit-results');
const dynamicOnly = process.argv.includes('--dynamic-only');
fs.mkdirSync(out, { recursive: true });
const cases = [],
	errors = [],
	requests = [],
	blockedOrigins = [],
	consoleMessages = [];
const browser = await chromium.launch({
	headless: true,
	// Keep native scrollbar geometry: Playwright normally hides it in headless mode.
	ignoreDefaultArgs: ['--hide-scrollbars'],
	...(process.env.OVIS_CHROMIUM ? { executablePath: process.env.OVIS_CHROMIUM } : {})
});
let currentPage;
const storeModuleUrls = new WeakMap();

function completeSelection(value, selection) {
	if (Array.isArray(value)) return value.map((item) => completeSelection(item, selection));
	if (value === null || typeof value !== 'object' || !selection) return value;
	return Object.fromEntries(
		selection.selections
			.filter((field) => field.kind === 'Field')
			.map((field) => [
				field.alias?.value ?? field.name.value,
				Object.hasOwn(value, field.name.value)
					? completeSelection(value[field.name.value], field.selectionSet)
					: null
			])
	);
}

async function createPage(darkMode, viewport, options = {}) {
	const controls = { failNext: options.failNext, holdNext: null, failAudit: null };
	const auditRecords = [];
	const downloads = [];
	const pageRequests = [];
	const stored = {
		currentUser: 'synthetic-export-test',
		currentRole: options.role || 'admin',
		currentLanguage: options.language || 'de',
		currentTheme: false,
		primaryColorRGB: { r: 0, g: 128, b: 80 },
		primaryColor: '#008050',
		colorPalette: ['#008050', '#229966', '#55bb99', '#9acdb7'],
		paletteName: 'CCCMunich',
		darkMode,
		chartShowTop5: false,
		chartHideNullValues: false,
		pseudonymization: false,
		currentFilter: options.mandatoryFilter ? JSON.stringify(options.mandatoryFilter) : '',
		keycloakTokens: {
			access_token: 'synthetic-local-token',
			refresh_token: 'synthetic-local-refresh',
			expires_in: 36000,
			timestamp: Date.now()
		}
	};
	const context = await browser.newContext({
		viewport,
		timezoneId: 'Europe/Berlin',
		locale: 'de-DE',
		acceptDownloads: true
	});
	const page = await context.newPage();
	const moduleUrls = {};
	storeModuleUrls.set(page, moduleUrls);
	page.on('request', (request) => {
		const url = new URL(request.url());
		for (const name of ['languageStore', 'variantStore', 'userStore']) {
			if (url.pathname === `/src/store/${name}.js`) moduleUrls[name] ??= url.href;
		}
	});
	currentPage = page;
	page.setDefaultTimeout(15000);
	page.on('download', (download) => downloads.push(download));
	page.on('pageerror', (error) => errors.push(error.stack));
	page.on('console', (message) => {
		consoleMessages.push({ type: message.type(), text: message.text() });
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('dialog', (dialog) => {
		errors.push(dialog.message());
		void dialog.dismiss();
	});
	await page.addInitScript((value) => {
		localStorage.setItem('loggedInUser', JSON.stringify(value));
		sessionStorage.setItem('disclaimerShown', 'true');
		Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
	}, stored);

	function respond(name, args) {
		if (name === 'getExportFields') {
			const rows = options.rows?.[args.collection] ?? exportBuilderRows[args.collection] ?? [];
			const known = datasets.find((dataset) => dataset.id === args.collection)?.fields ?? [];
			const fields = new Map(known.map((field) => [field.id, field.type.toUpperCase()]));
			for (const row of rows) {
				for (const [id, value] of Object.entries(row)) {
					if (!fields.has(id)) fields.set(id, typeof value === 'number' ? 'NUMBER' : 'TEXT');
				}
			}
			return [...fields].map(([id, type]) => ({ id, type }));
		}
		if (name === 'getExportRows') {
			let rows = options.rows?.[args.collection] ?? exportBuilderRows[args.collection] ?? [];
			if (options.mandatoryPatient)
				rows = rows.filter((row) => row.patID === options.mandatoryPatient);
			return rows.slice(args.offset, args.offset + args.limit).map((row) => JSON.stringify(row));
		}
		if (name === 'createExportAudit') {
			const id = '00000000-0000-4000-8000-' + String(auditRecords.length + 1).padStart(12, '0');
			const record = {
				...args.input,
				id,
				createdAt: Date.now(),
				userId: stored.currentUser,
				userRole: stored.currentRole,
				anonymousDemo: false,
				status: 'CREATED',
				fileName: args.input.fileName.replace(/(\.[^.]+)$/, '_' + id + '$1'),
				mandatoryFilter: JSON.stringify({ type: 'AND', children: [] }),
				effectiveFilter: args.input.filter,
				metadataSource: 'BROWSER_REPORTED',
				preparedAt: null,
				completedAt: null,
				sizeBytes: null,
				sha256: null,
				rowCount: null
			};
			auditRecords.push(record);
			return record;
		}
		if (name === 'prepareExportAudit') {
			Object.assign(
				auditRecords.find((record) => record.id === args.id),
				args,
				{ preparedAt: Date.now(), status: 'PREPARED' }
			);
			return true;
		}
		if (name === 'completeExportAudit') {
			Object.assign(
				auditRecords.find((record) => record.id === args.id),
				{ completedAt: Date.now(), status: args.outcome }
			);
			return true;
		}
		if (name === 'getExportAudits') {
			const records = (options.auditRecords || auditRecords).filter(
				(record) =>
					!args.search ||
					[record.id, record.userId, record.fileName, record.sha256].some((value) =>
						String(value).includes(args.search)
					)
			);
			return {
				total: records.length,
				records: records.slice(args.offset || 0, (args.offset || 0) + (args.limit || 50))
			};
		}
		if (name === 'getUsageReport') return null;
		if (name === 'getUsageByUser')
			return [{ userId: 'synthetic-export-test', timeOnline: 7200, filterClicks: 2 }];

		if (endpoints[name]) {
			let rows = options.rows?.[endpoints[name]] ?? exportBuilderRows[endpoints[name]];
			if (options.mandatoryPatient)
				rows = rows.filter((row) => row.patID === options.mandatoryPatient);
			return rows
				.slice(args.offset || 0, (args.offset || 0) + (args.limit || rows.length))
				.map((row) => {
					const result = {};
					const source =
						options.longPreviewValue &&
						endpoints[name] === 'radiation' &&
						row.areaDetailed === 'Linke Brust'
							? { ...row, areaDetailed: options.longPreviewValue }
							: row;
					for (const [field, value] of Object.entries(source)) {
						const parts = field.split('.');
						let parent = result;
						for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
						parent[parts.at(-1)] = value;
					}
					return result;
				});
		}
		if (name === 'getPlatformConfiguration')
			return {
				colorTheme: 'CCCMunich',
				colorPalette: stored.colorPalette,
				systemLanguage: options.language || 'de',
				source: 'TEST',
				documents: []
			};
		if (name === 'getUser')
			return [
				{
					_id: stored.currentUser,
					role: stored.currentRole,
					status: 'active',
					language: options.language || 'de',
					firstLogin: Date.now(),
					darkMode,
					userFilter: [],
					filter: stored.currentFilter
				}
			];
		if (name === 'getLastMetaData') return { executedAt: Date.now() };
		// App-shell session bookkeeping is intercepted, never sent to a real account.
		if (name.startsWith('update') || name === 'recordUsageEvents') return { acknowledged: true };
		if (name === 'getQuicktoolsCountOverview')
			return ['patient', 'diagnosis', 'therapy', 'progress'].map((collection) => ({
				collection,
				count: 0
			}));
		return [];
	}
	await page.route('**/*', async (route) => {
		const request = route.request(),
			url = new URL(request.url());
		if (url.origin !== new URL(base).origin) {
			blockedOrigins.push(url.origin);
			return route.abort();
		}
		if (options.env && url.pathname === '/@id/__x00__virtual:$env/dynamic/public') {
			const response = await route.fetch();
			const source = await response.text();
			assert.match(source, /export const env = globalThis\.__sveltekit_dev\.env/);
			return route.fulfill({
				response,
				body: `${source}\nObject.assign(env, ${JSON.stringify(options.env)});`
			});
		}
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
					data: [],
					revision: 'synthetic-export-1',
					source: 'synthetic fixture',
					timestamp: Date.now(),
					size: 0
				}
			});
		if (url.pathname.endsWith('/graphql')) {
			const body = request.postDataJSON(),
				data = {};
			for (const definition of parse(body.query).definitions) {
				for (const field of definition.selectionSet?.selections ?? []) {
					const name = field.name.value;
					const args = Object.fromEntries(
						(field.arguments ?? []).map((argument) => [
							argument.name.value,
							valueFromASTUntyped(argument.value, body.variables)
						])
					);
					const logged = { name, args, at: Date.now(), operation: definition.name?.value };
					requests.push(logged);
					pageRequests.push(logged);
					if (controls.failAudit === name) {
						controls.failAudit = null;
						return route.fulfill({
							json: {
								errors: [
									{
										message: 'Test audit failure',
										extensions: {
											code: options.unauthenticated ? 'UNAUTHENTICATED' : 'INTERNAL_SERVER_ERROR'
										}
									}
								]
							}
						});
					}
					if (controls.failNext === name) {
						controls.failNext = null;
						return route.fulfill({
							json: { errors: [{ message: 'Test: export API unavailable' }] }
						});
					}
					data[field.alias?.value ?? name] = completeSelection(
						respond(name, args),
						field.selectionSet
					);
					if (definition.name?.value === 'ExportDataset' && controls.holdNext?.name === name) {
						const held = controls.holdNext;
						controls.holdNext = null;
						data[field.alias?.value ?? name] = data[field.alias?.value ?? name].map((row) => ({
							...row,
							tumorID: 'STALE-RESULT'
						}));
						held.started();
						await held.wait;
						held.released = true;
					}
				}
			}
			return route.fulfill({ json: { data } });
		}
		if (url.pathname.startsWith('/api/')) {
			errors.push(`Unmocked API request: ${url.pathname}`);
			return route.abort();
		}
		return route.continue();
	});
	await page.goto(`${base}/export`, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.getByTestId('export-builder').waitFor();
	await page.waitForFunction(
		(dark) => document.body.classList.contains('dark-mode') === dark,
		darkMode
	);
	await waitReady(page);
	return {
		context,
		page,
		root: page.getByTestId('export-builder'),
		controls,
		pageRequests,
		auditRecords,
		downloads
	};
}

async function waitReady(page) {
	await page.locator('.export-preview[aria-busy="false"]').waitFor();
}

async function openCsv(test, language = 'de') {
	await test.root
		.getByRole('button', { name: translations[language].exportDownloadCsv, exact: true })
		.click();
	const dialog = test.page.getByRole('dialog', {
		name: translations[language].exportConfirmationTitle
	});
	await dialog.waitFor();
	return dialog;
}

async function confirmDownload(test, dialog, language = 'de') {
	const received = test.page.waitForEvent('download');
	await dialog
		.getByRole('button', { name: translations[language].exportConfirmationConfirm })
		.click();
	const download = await received;
	const bytes = fs.readFileSync(await download.path());
	await test.page.waitForFunction(() => !document.querySelector('dialog.export-confirmation').open);
	for (
		let tries = 0;
		tries < 100 && test.auditRecords.at(-1)?.status !== 'DOWNLOAD_STARTED';
		tries++
	) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	const record = test.auditRecords.at(-1);
	assert.equal(download.suggestedFilename(), record.fileName);
	assert.ok(record.fileName.includes(record.id));
	assert.equal(record.sizeBytes, bytes.length);
	assert.equal(record.sha256, createHash('sha256').update(bytes).digest('hex'));
	assert.equal(record.status, 'DOWNLOAD_STARTED');
	return { record, bytes };
}

async function confirmationCases() {
	const test = await createPage(false, { width: 1600, height: 920 });
	let dialog = await openCsv(test);
	assert.equal(await dialog.getByRole('checkbox').count(), 0);
	assert.ok(
		await dialog
			.getByRole('button', { name: translations.de.exportConfirmationConfirm })
			.isEnabled()
	);
	assert.match(await dialog.innerText(), /persönlichen OVIS-Konto/);
	assert.equal(
		test.pageRequests.filter((request) => request.name === 'createExportAudit').length,
		0
	);
	await dialog.getByRole('button', { name: translations.de.cancel, exact: true }).click();
	await dialog.waitFor({ state: 'hidden' });
	assert.equal(test.downloads.length, 0);
	dialog = await openCsv(test);

	await test.page.keyboard.press('Escape');
	await dialog.waitFor({ state: 'hidden' });
	assert.equal(test.auditRecords.length, 0);
	assert.equal(test.downloads.length, 0);
	cases.push({ name: 'german-direct-acceptance-cancel-escape-no-audit-or-download' });

	await test.root.locator('.alias-row input').first().fill('Participant');
	dialog = await openCsv(test);
	assert.ok(
		await dialog
			.getByRole('button', { name: translations.de.exportConfirmationConfirm })
			.isEnabled()
	);
	await test.page.screenshot({ path: path.join(out, 'confirmation-de.png'), fullPage: true });
	await dialog.screenshot({ path: path.join(out, 'export-confirmation-disclaimer-de.png') });
	const { record, bytes } = await confirmDownload(test, dialog);
	const csv = bytes.toString('utf8').replace(/^\uFEFF/, '');
	assert.match(csv.split(/\r?\n/)[0], /Participant/);
	assert.equal(record.kind, 'TABLE');
	assert.equal(record.format, 'CSV');
	assert.equal(record.route, '/export');
	const specification = JSON.parse(record.selection);
	assert.equal(specification.base, 'patient');
	assert.equal(specification.columns[0].alias, 'Participant');
	assert.equal(record.rowCount, csv.trim().split(/\r?\n/).length - 1);
	const dataFilter = test.pageRequests.find((request) => request.name === 'getExportRows').args
		.filter;
	assert.equal(record.filter, dataFilter);
	cases.push({
		name: 'csv-audit-context-alias-actual-bytecount-sha256-filename-id',
		id: record.id,
		bytes: bytes.length
	});

	dialog = await openCsv(test);
	assert.ok(
		await dialog
			.getByRole('button', { name: translations.de.exportConfirmationConfirm })
			.isEnabled()
	);
	await dialog.getByRole('button', { name: translations.de.cancel, exact: true }).click();
	assert.equal(test.auditRecords.length, 1);
	cases.push({ name: 'every-attempt-requires-fresh-confirmation' });

	for (const endpoint of ['createExportAudit', 'prepareExportAudit']) {
		test.controls.failAudit = endpoint;
		const before = test.downloads.length;
		dialog = await openCsv(test);

		await dialog.getByRole('button', { name: translations.de.exportConfirmationConfirm }).click();
		await test.root.getByText(translations.de.exportAuditUnavailable, { exact: true }).waitFor();
		assert.equal(test.downloads.length, before);
		if (endpoint === 'prepareExportAudit') assert.equal(test.auditRecords.at(-1).status, 'FAILED');
		cases.push({ name: `${endpoint}-failure-releases-no-bytes` });
	}

	await test.page.locator('.filter-history-controls button:has(img[alt="download"])').click();
	dialog = test.page.getByRole('dialog');
	await dialog.waitFor();
	const json = await confirmDownload(test, dialog);
	assert.equal(json.record.kind, 'FILTER');
	assert.equal(json.record.format, 'JSON');
	assert.deepEqual(JSON.parse(json.bytes.toString('utf8')), JSON.parse(json.record.filter));
	cases.push({ name: 'filter-json-button-uses-same-confirmation-and-audit' });

	await test.page.goto(`${base}/analytics`);
	const chartButton = test.page
		.locator('.analytics-content button:has(img[alt="download"])')
		.first();
	await chartButton.waitFor();
	await chartButton.click();
	dialog = test.page.getByRole('dialog');
	await dialog.waitFor();
	const png = await confirmDownload(test, dialog);
	assert.equal(png.record.kind, 'CHART');
	assert.equal(png.record.format, 'PNG');
	assert.deepEqual([...png.bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
	assert.ok(JSON.parse(png.record.selection).width > 0);
	cases.push({ name: 'analytics-chart-png-button-uses-same-confirmation-and-audit' });

	await test.page
		.getByRole('button', { name: translations.de.exportAuditTitle, exact: true })
		.click();
	await test.page.locator('.export-audit[aria-busy="false"]').waitFor();
	assert.ok((await test.page.locator('.audit-table tbody > tr').count()) >= 3);
	await test.page.getByLabel(translations.de.exportAuditSearch).fill(record.id);
	await test.page
		.getByRole('button', { name: translations.de.exportAuditSearchButton, exact: true })
		.click();
	await test.page.locator('.export-audit[aria-busy="false"]').waitFor();
	assert.equal(await test.page.locator('.audit-table tbody > tr').count(), 1);
	assert.equal(
		test.pageRequests.filter((request) => request.name === 'getExportAudits').at(-1).args.search,
		record.id
	);
	await test.page
		.getByRole('button', { name: translations.de.exportAuditDetails, exact: true })
		.click();
	assert.ok((await test.page.locator('.audit-details').innerText()).includes(record.sha256));
	assert.ok((await test.page.locator('.audit-details').innerText()).includes('Participant'));
	assert.match(await test.page.locator('.audit-table tbody td').first().innerText(), /UTC/);
	assert.equal(
		await test.page.locator('.audit-table tbody td').first().getAttribute('title'),
		new Date(record.createdAt).toISOString()
	);
	assert.equal(await test.page.locator('.export-audit button:has(img[alt="download"])').count(), 0);
	await test.page.screenshot({ path: path.join(out, 'audit-details-de.png'), fullPage: true });
	cases.push({ name: 'admin-audit-search-details-utc-provenance-no-export' });
	for (let index = test.auditRecords.length; index < 55; index++) {
		test.auditRecords.push({
			...record,
			id: `synthetic-history-${index}`,
			fileName: `history-${index}.csv`
		});
	}
	await test.page.getByLabel(translations.de.exportAuditSearch).fill('');
	await test.page
		.getByRole('button', { name: translations.de.exportAuditSearchButton, exact: true })
		.click();
	await test.page.locator('.export-audit[aria-busy="false"]').waitFor();
	assert.equal(await test.page.locator('.audit-table tbody > tr').count(), 50);
	await test.page.getByRole('button', { name: translations.de.exportAuditNext }).click();
	await test.page.locator('.export-audit[aria-busy="false"]').waitFor();
	assert.equal(await test.page.locator('.audit-table tbody > tr').count(), 5);
	assert.equal(
		test.pageRequests.filter((request) => request.name === 'getExportAudits').at(-1).args.offset,
		50
	);
	assert.ok(
		await test.page.getByRole('button', { name: translations.de.exportAuditNext }).isDisabled()
	);
	cases.push({ name: 'audit-history-paginates-in-fifty-record-pages' });
	await test.context.close();
}

async function localeAndPermissions() {
	const test = await createPage(true, { width: 900, height: 680 }, { language: 'en' });
	const dialog = await openCsv(test, 'en');
	assert.match(await dialog.innerText(), /personal OVIS account/);
	assert.ok(
		await dialog
			.getByRole('button', { name: translations.en.exportConfirmationConfirm })
			.isEnabled()
	);
	const bounds = await dialog.evaluate((element) => {
		const r = element.getBoundingClientRect();
		return {
			x: r.x,
			y: r.y,
			right: r.right,
			bottom: r.bottom,
			width: innerWidth,
			height: innerHeight,
			scroll: element.scrollHeight,
			client: element.clientHeight
		};
	});
	assert.ok(
		bounds.x >= 0 && bounds.y >= 0 && bounds.right <= bounds.width && bounds.bottom <= bounds.height
	);
	await test.page.screenshot({
		path: path.join(out, 'confirmation-en-dark-900x680.png'),
		fullPage: false
	});
	await dialog.getByRole('button', { name: translations.en.cancel, exact: true }).click();
	await test.context.close();
	cases.push({ name: 'english-dark-narrow-native-dialog-viewport-contained', bounds });

	for (const role of ['user', 'manager', 'super-admin']) {
		const restricted = await createPage(false, { width: 1600, height: 920 }, { role });
		await restricted.page.goto(`${base}/analytics`);
		await restricted.page.waitForLoadState('networkidle');
		assert.equal(
			await restricted.page
				.getByRole('button', { name: translations.de.exportAuditTitle, exact: true })
				.count(),
			role === 'super-admin' ? 1 : 0
		);
		assert.equal(
			restricted.pageRequests.filter((request) => request.name === 'getExportAudits').length,
			0
		);
		await restricted.context.close();
		cases.push({ name: `audit-tab-permission-${role}` });
	}

	const anonymous = await createPage(
		false,
		{ width: 1600, height: 920 },
		{ unauthenticated: true }
	);
	anonymous.controls.failAudit = 'createExportAudit';
	const blocked = await openCsv(anonymous);

	await blocked.getByRole('button', { name: translations.de.exportConfirmationConfirm }).click();
	await anonymous.root
		.getByText(translations.de.exportAuditLoginRequired, { exact: true })
		.waitFor();
	assert.equal(anonymous.downloads.length, 0);
	cases.push({ name: 'unauthenticated-audit-response-blocks-export-with-login-notice' });
	await anonymous.context.close();
}

async function dynamicFieldCases() {
	const arrayValue = JSON.stringify([
		false,
		0,
		null,
		'',
		{ code: 'A;B', valid: false },
		['nested', null]
	]);
	const lateValue = 'Late; value\n"quoted"';
	// Wire rows intentionally contain JSON strings for arrays/booleans, as the raw-export API specifies.
	const diagnosis = Array.from({ length: 1002 }, (_, index) => ({
		_id: `SYNTHETIC-${String(index).padStart(4, '0')}`,
		patID: 'DEMO-P01',
		tumorID: `SYNTHETIC-T${index}`,
		'ICD.ICD10': 'C50.9',
		metastasis: index % 2 ? 'true' : 'false',
		recurrence: index % 2 ? 'false' : 'true',
		customZero: 0,
		customNull: null,
		'custom.assessments': arrayValue,
		'custom.codes': '["A",null,"B"]',
		...(index === 1001 ? { customLate: lateValue } : {})
	}));
	const test = await createPage(
		false,
		{ width: 1880, height: 920 },
		{
			rows: { patient: [exportBuilderRows.patient[0]], diagnosis }
		}
	);
	const fields = [
		['metastasis', 'META'],
		['recurrence', 'REC'],
		['customZero', 'ZERO'],
		['customNull', 'NULL'],
		['custom.assessments', 'ARRAY'],
		['custom.codes', 'CODES'],
		['customLate', 'LATE']
	];
	for (const [id, alias] of fields) {
		const checkbox = test.root.locator(`#export-table-diagnosis label[title$="(${id})"] input`);
		await checkbox.check();
		await test.root.locator('.alias-row input').last().fill(alias);
	}
	assert.equal(
		await test.root
			.locator('#export-table-diagnosis .field-label')
			.filter({ hasText: /^customLate$/ })
			.count(),
		1
	);
	const pages = test.pageRequests.filter(
		(request) => request.name === 'getExportRows' && request.args.collection === 'diagnosis'
	);
	assert.deepEqual(
		pages.map((request) => request.args.offset),
		[0, 1000, 1002]
	);
	assert.ok(pages.every((request) => request.args.limit === 1000));
	const before = test.pageRequests.length;
	const { bytes, record } = await confirmDownload(test, await openCsv(test));
	const workbook = xlsx.read(bytes.toString('utf8').replace(/^\uFEFF/, ''), {
		type: 'string',
		raw: true,
		FS: ';'
	});
	const csv = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
		header: 1,
		raw: true,
		defval: ''
	});
	const headers = csv[0];
	const value = (row, alias) => row[headers.indexOf(alias)];
	assert.equal(csv.length, 1003);
	assert.equal(record.rowCount, 1002);
	assert.equal(value(csv[1], 'META'), 'false');
	assert.equal(value(csv[2], 'META'), 'true');
	assert.equal(value(csv[1], 'REC'), 'true');
	assert.equal(value(csv[2], 'REC'), 'false');
	assert.equal(value(csv[1], 'ZERO'), '0');
	assert.equal(value(csv[1], 'NULL'), '');
	assert.equal(value(csv[1], 'ARRAY'), arrayValue);
	assert.deepEqual(JSON.parse(value(csv[1], 'ARRAY')), [
		false,
		0,
		null,
		'',
		{ code: 'A;B', valid: false },
		['nested', null]
	]);
	assert.equal(value(csv[1], 'CODES'), '["A",null,"B"]');
	assert.equal(value(csv.at(-1), 'LATE'), lateValue);
	assert.equal(value(csv[1], 'LATE'), '');
	assert.equal(
		test.pageRequests
			.slice(before)
			.filter((request) => ['getExportFields', 'getExportRows'].includes(request.name)).length,
		0
	);
	const specification = JSON.parse(record.selection);
	for (const [id, alias] of fields)
		assert.ok(
			specification.columns.some(
				(column) => column.dataset === 'diagnosis' && column.field === id && column.alias === alias
			)
		);
	await test.page.screenshot({
		path: path.join(out, 'dynamic-fields-preview.png'),
		fullPage: true
	});
	cases.push({
		name: 'dynamic-custom-derived-late-fields-and-exact-csv-values',
		pages: pages.map((request) => request.args.offset),
		rows: record.rowCount
	});
	await test.context.close();

	for (const endpoint of ['getExportFields', 'getExportRows']) {
		const failed = await createPage(false, { width: 1600, height: 920 }, { failNext: endpoint });
		const download = failed.root.getByRole('button', {
			name: translations.de.exportDownloadCsv,
			exact: true
		});
		assert.ok(await download.isDisabled());
		assert.equal(failed.downloads.length, 0);
		await failed.root
			.getByRole('button', { name: translations.de.chartRetry, exact: true })
			.click();
		await waitReady(failed.page);
		assert.ok(await download.isEnabled());
		cases.push({ name: `${endpoint}-failure-disables-export-and-retry-recovers` });
		await failed.context.close();
	}
}

let failure;
try {
	if (dynamicOnly) await dynamicFieldCases();
	else {
		await confirmationCases();
		await localeAndPermissions();
	}
	assert.deepEqual(errors, [], 'No browser errors');
	assert.deepEqual(blockedOrigins, [], 'No external network requests');
} catch (error) {
	failure = error;
	if (currentPage && !currentPage.isClosed()) {
		await currentPage
			.screenshot({ path: path.join(out, 'failure.png'), fullPage: true })
			.catch(() => {});
		fs.writeFileSync(
			path.join(out, 'failure-dom.txt'),
			await currentPage.locator('body').innerText()
		);
	}
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
				requests
			},
			null,
			2
		)
	);
	await browser.close();
}
if (failure) throw failure;
console.log(`PASS ${cases.length} export audit scenarios; reports in ${out}`);
