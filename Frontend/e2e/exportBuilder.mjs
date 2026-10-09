import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
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
const base = process.env.OVIS_TEST_URL || 'http://127.0.0.1:5192';
assert.ok(
	['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname),
	'Only a local isolated app is supported'
);
const out = path.resolve(process.env.OVIS_TEST_OUTPUT || 'export-builder-results');
const layoutOnly = process.argv.includes('--layout-only');
const availabilityOnly = process.argv.includes('--availability-only');
const localizationOnly = process.argv.includes('--localization-only');
const columnsOnly = process.argv.includes('--columns-only');
const resetOnly = process.argv.includes('--reset-only');
const selectionOnly = process.argv.includes('--selection-only');
const autoBaseOnly = process.argv.includes('--auto-base-only');
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
	const controls = { failNext: options.failNext, holdNext: null };
	const pageRequests = [];
	const stored = {
		currentUser: 'synthetic-export-test',
		currentRole: 'user',
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
		for (const name of ['languageStore', 'variantStore']) {
			if (url.pathname === `/src/store/${name}.js`) moduleUrls[name] ??= url.href;
		}
	});
	currentPage = page;
	page.setDefaultTimeout(15000);
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
					role: 'user',
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
					if (definition.name?.value === 'ExportDataset' && controls.failNext === name) {
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
	return { context, page, root: page.getByTestId('export-builder'), controls, pageRequests };
}

async function waitReady(page) {
	await page.locator('.export-preview[aria-busy="false"]').waitFor();
}

function tableCheckbox(root, id) {
	const dataset = datasets.find((item) => item.id === id);
	assert.ok(dataset, `Known export table: ${id}`);
	const escaped = (language) =>
		translations[language][dataset.label].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return root.getByRole('checkbox', {
		name: new RegExp(`^(?:Tabelle ${escaped('de')} auswählen|Select table ${escaped('en')})$`)
	});
}

async function baseDataset(root) {
	const card = root.locator('.field-module:has(.base-description)');
	return (await card.count()) ? (await card.getAttribute('id')).replace('export-table-', '') : null;
}

async function selectExportTables(page, root, ids) {
	for (const id of ids) {
		await tableCheckbox(root, id).check();
		await waitReady(page);
	}
}

async function setExportTables(page, root, ids) {
	for (const dataset of datasets) {
		const checkbox = tableCheckbox(root, dataset.id);
		if (!ids.includes(dataset.id) && (await checkbox.count()) && (await checkbox.isChecked())) {
			await checkbox.uncheck();
			await waitReady(page);
		}
	}
	await selectExportTables(page, root, ids);
}

async function snapshot(page, root, name) {
	await page.evaluate(() => document.fonts.ready);
	const layout = await root.evaluate((element) => {
		const rectangle = element.getBoundingClientRect();
		const bounds = (node) => {
			if (!node) return null;
			const area = node.getBoundingClientRect();
			return {
				top: area.top,
				bottom: area.bottom,
				left: area.left,
				right: area.right,
				height: area.height
			};
		};
		const preview = element.querySelector('.export-preview');
		const scroll = element.querySelector('.preview-scroll');
		const footer = element.querySelector('.preview-footer');
		const scrollStyle = scroll && getComputedStyle(scroll);
		return {
			viewport: { width: window.innerWidth, height: window.innerHeight },
			document: {
				clientWidth: document.documentElement.clientWidth,
				scrollWidth: document.documentElement.scrollWidth
			},
			root: {
				x: rectangle.x,
				y: rectangle.y,
				width: rectangle.width,
				height: rectangle.height,
				bottom: rectangle.bottom,
				clientHeight: element.clientHeight,
				scrollHeight: element.scrollHeight
			},
			preview: bounds(preview),
			footer: bounds(footer),
			previewScroll: scroll && {
				...bounds(scroll),
				clientWidth: scroll.clientWidth,
				scrollWidth: scroll.scrollWidth,
				scrollLeft: scroll.scrollLeft,
				contentBottom: scroll.getBoundingClientRect().top + scroll.clientTop + scroll.clientHeight,
				horizontalScrollbarHeight:
					scroll.offsetHeight -
					scroll.clientHeight -
					parseFloat(scrollStyle.borderTopWidth) -
					parseFloat(scrollStyle.borderBottomWidth),
				lastRow: bounds(scroll.querySelector('tbody tr:last-child'))
			},
			scrollAreas: [...element.querySelectorAll('*')]
				.filter((node) => {
					const style = getComputedStyle(node);
					return /auto|scroll/.test(style.overflowX + style.overflowY);
				})
				.map((node) => ({
					className: node.className,
					clientWidth: node.clientWidth,
					scrollWidth: node.scrollWidth,
					clientHeight: node.clientHeight,
					scrollHeight: node.scrollHeight
				}))
		};
	});
	await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
	assert.ok(
		layout.document.scrollWidth <= layout.document.clientWidth + 1,
		`${name}: document has horizontal overflow (${layout.document.scrollWidth}/${layout.document.clientWidth})`
	);
	assert.ok(
		layout.footer.bottom <= layout.root.bottom + 1,
		`${name}: preview footer is clipped by the builder`
	);
	assert.ok(
		layout.footer.bottom <= layout.preview.bottom + 1,
		`${name}: preview footer leaves its panel`
	);
	if (layout.viewport.height >= 680) {
		assert.ok(
			layout.footer.bottom <= layout.viewport.height + 1,
			`${name}: preview footer is below the viewport`
		);
		assert.ok(
			layout.root.scrollHeight <= layout.root.clientHeight + 1,
			`${name}: builder requires vertical scrolling to reach the preview`
		);
		for (const area of layout.scrollAreas.filter((area) =>
			area.className.split(/\s+/).includes('field-list')
		)) {
			assert.ok(
				area.clientHeight >= 26,
				`${name}: field list cannot display even one complete field row (${area.clientHeight}px)`
			);
		}
	}
	if (layout.previewScroll) {
		assert.ok(
			layout.previewScroll.bottom <= layout.footer.top + 1,
			`${name}: horizontal scrollbar is hidden behind the footer`
		);
		assert.ok(
			layout.previewScroll.bottom <= layout.root.bottom + 1,
			`${name}: preview scrollbar leaves the builder`
		);
		if (layout.previewScroll.lastRow) {
			assert.ok(
				layout.previewScroll.lastRow.bottom <= layout.previewScroll.contentBottom + 1,
				`${name}: final preview row is clipped above the horizontal scrollbar`
			);
		}
	}
	cases.push({ name, layout });
}

async function layoutScenarios() {
	const requested = new Set(
		process.argv
			.filter((arg) => arg.startsWith('--layout-viewport='))
			.map((arg) => arg.slice('--layout-viewport='.length))
	);
	const viewports = [
		{ width: 1880, height: 920 },
		{ width: 1600, height: 680 }
	].filter(({ width, height }) => !requested.size || requested.has(`${width}x${height}`));
	assert.ok(viewports.length, 'At least one known layout viewport must be selected');
	for (const viewport of viewports) {
		const { context, page, root } = await createPage(false, viewport);
		const name = `${viewport.width}x${viewport.height}`;
		await snapshot(page, root, `layout-${name}-default`);
		await root
			.locator('#export-table-diagnosis')
			.getByRole('button', { name: 'Alle', exact: true })
			.click();
		const scroll = root.locator('.preview-scroll');
		assert.ok(
			await scroll.evaluate((element) => element.scrollWidth > element.clientWidth),
			'Many selected fields need horizontal scrolling'
		);
		await scroll.hover();
		await page.mouse.wheel(1400, 0);
		await page.waitForFunction(() => document.querySelector('.preview-scroll').scrollLeft > 0);
		await snapshot(page, root, `layout-${name}-wide-scrolled`);
		await context.close();
	}
}

async function interactions(page, root) {
	const catalogue = root.locator('.catalogue-list');
	const selectedTables = catalogue.getByRole('checkbox', { checked: true });
	assert.equal(await selectedTables.count(), 2, 'Tumors and patients are selected initially');
	const names = await selectedTables.evaluateAll((checkboxes) =>
		checkboxes.map((checkbox) => checkbox.getAttribute('aria-label'))
	);
	assert.ok(
		names.some((name) => /Tumor|Diagnos/.test(name)),
		`Diagnosis table selected: ${names}`
	);
	assert.ok(
		names.some((name) => /Patient/.test(name)),
		`Patient table selected: ${names}`
	);
	assert.equal(await root.locator('table tbody tr').count(), 5, 'Preview contains five rows');
	assert.equal(await root.locator('.alias-row input').count(), 4);
	assert.ok(!(await root.innerText()).includes('Beispieldaten'));
	cases.push({ name: 'default-tables-and-five-row-preview', selectedTables: names });
	await selectExportTables(page, root, ['therapy', 'radiation']);
	assert.match(
		await root.locator('#export-table-radiation .connection-path').innerText(),
		/Therapien\._id/
	);
	assert.equal(
		await catalogue
			.getByRole('checkbox', { name: 'Tabelle Beratungen auswählen', exact: true })
			.count(),
		1
	);
	assert.equal(
		await catalogue
			.getByRole('checkbox', { name: 'Tabelle Studie auswählen', exact: true })
			.count(),
		1
	);
	assert.ok(
		await catalogue
			.getByRole('checkbox', { name: 'Tabelle Tumore auswählen', exact: true })
			.isEnabled(),
		'Every selected table can be unchecked'
	);

	const aliases = root.locator('input[aria-label^="Exportname für "]');
	const initialAliasCount = await aliases.count();
	const uncheckedLabel = root
		.locator('.field-module label')
		.filter({ has: page.locator('input[type="checkbox"]:not(:checked)') })
		.first();
	const label = (await uncheckedLabel.locator('.field-label').innerText())
		.replace(/\s+/g, ' ')
		.trim();
	assert.ok(label, 'Field checkbox has a visible label');
	const moduleId = await uncheckedLabel.evaluate((element) => element.closest('.field-module').id);
	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const fieldCheckbox = root
		.locator(`#${moduleId}`)
		.getByRole('checkbox', { name: new RegExp(`^${escapedLabel}(?:\\s|$)`) });
	await fieldCheckbox.check();
	assert.equal(
		await aliases.count(),
		initialAliasCount + 1,
		'Checking a field adds a preview column'
	);
	await fieldCheckbox.uncheck();
	assert.equal(
		await aliases.count(),
		initialAliasCount,
		'Unchecking a field removes its preview column'
	);
	cases.push({ name: 'field-selection-updates-preview', label });

	const alias = aliases.first();
	const originalName = await alias.getAttribute('aria-label');
	const customName = 'Meine_Tumor_ID';
	await alias.fill(customName);
	const secondAlias = aliases.nth(1);
	const secondOriginal = await secondAlias.inputValue();
	await secondAlias.fill(customName);
	const downloadButton = root.getByRole('button', {
		name: 'CSV herunterladen',
		exact: true
	});
	assert.ok(await downloadButton.isDisabled(), 'Duplicate export names disable CSV download');
	assert.ok((await root.getByRole('alert').innerText()).includes('eindeutig'));
	await secondAlias.fill(secondOriginal);
	assert.ok(await downloadButton.isEnabled(), 'Fixing duplicate names restores CSV download');
	cases.push({ name: 'duplicate-export-names-are-rejected' });
	const totalElement = root.locator('[data-total-rows]').first();
	const totalRows = (await totalElement.count())
		? Number(await totalElement.getAttribute('data-total-rows'))
		: Number((await root.innerText()).match(/\b5\s+von\s+(\d+)\s+Zeilen/)?.[1]);
	assert.ok(
		totalRows > 5,
		'Preview exposes a full result count greater than its five displayed rows'
	);
	const downloadPromise = page.waitForEvent('download');
	await root.getByRole('button', { name: 'CSV herunterladen', exact: true }).click();
	const download = await downloadPromise;
	const csvPath = path.join(out, 'export-with-custom-header.csv');
	await download.saveAs(csvPath);
	const workbook = xlsx.read(fs.readFileSync(csvPath), { type: 'buffer', raw: true });
	const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
		header: 1,
		defval: ''
	});
	assert.equal(rows[0][0], customName, 'CSV uses the custom export name');
	assert.equal(rows.length - 1, totalRows, 'CSV exports the full result, not only preview rows');
	cases.push({
		name: 'custom-name-and-complete-csv',
		originalName,
		customName,
		totalRows,
		csvPath
	});

	const radiationJoin = root.locator('#join-radiation');
	await radiationJoin.selectOption('inner');
	assert.equal(await radiationJoin.inputValue(), 'inner');
	const innerRows = Number(
		(await root.locator('.preview-footer').innerText()).match(/von\s+(\d+)\s+Zeilen/)?.[1]
	);
	assert.ok(innerRows <= totalRows, 'INNER does not create more result rows than LEFT');
	await radiationJoin.selectOption('left');
	assert.ok(
		(await root.locator('.preview-footer').innerText()).includes(`von ${totalRows} Zeilen`)
	);
	cases.push({ name: 'join-mode-updates-preview', leftRows: totalRows, innerRows });

	assert.equal(await baseDataset(root), 'patient');
	await tableCheckbox(root, 'patient').uncheck();
	await waitReady(page);
	assert.equal(await baseDataset(root), 'diagnosis');
	await selectExportTables(page, root, ['patient']);
	assert.equal(await baseDataset(root), 'patient');
	cases.push({ name: 'base-table-follows-table-checkboxes' });

	const addTable = catalogue.getByRole('checkbox', {
		name: 'Tabelle Histologie auswählen',
		exact: true
	});
	const addLabel = await addTable.getAttribute('aria-label');
	assert.ok(addLabel);
	await addTable.check();
	await waitReady(page);
	assert.ok(await addTable.isChecked());
	assert.equal(await selectedTables.count(), 5);
	assert.equal(await root.locator('#export-table-histology').count(), 1);
	const histologyCount = await root
		.locator('input[aria-label^="Exportname für Histologie."]')
		.count();
	const histologyName = await addTable.evaluate((checkbox) =>
		checkbox
			.closest('.catalogue-item')
			.querySelector('.catalogue-name')
			.textContent.replace(/\s+/g, ' ')
			.trim()
	);
	assert.match(
		histologyName,
		new RegExp(`^Histologie\\s*\\(${histologyCount}\\)$`),
		'Selected field count follows the table name in parentheses'
	);
	await snapshot(page, root, 'interactions-complete');
	await addTable.uncheck();
	await waitReady(page);
	assert.ok(!(await addTable.isChecked()));
	assert.equal(await selectedTables.count(), 4);
	assert.equal(await root.locator('#export-table-histology').count(), 0);
	assert.equal(await root.locator('input[aria-label^="Exportname für Histologie."]').count(), 0);
	cases.push({ name: 'table-checkbox-adds-and-removes-fields', label: addLabel, histologyName });

	const clearButtons = root
		.locator('.field-module')
		.getByRole('button', { name: 'Keine', exact: true });
	for (let index = 0; index < (await clearButtons.count()); index++)
		await clearButtons.nth(index).click();
	assert.equal(await aliases.count(), 0);
	assert.ok(await downloadButton.isDisabled(), 'No selected columns disables CSV download');
	assert.ok((await root.innerText()).includes('Wähle die Felder für deinen Export.'));
	await root.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
	await waitReady(page);
	assert.equal(await aliases.count(), 4);
	assert.equal(await selectedTables.count(), 2);
	assert.equal(await baseDataset(root), 'patient');
	assert.ok(await downloadButton.isEnabled());
	cases.push({ name: 'empty-selection-and-reset' });
}

async function autoBaseScenarios() {
	const state = await createPage(
		false,
		{ width: 1600, height: 680 },
		{
			rows: {
				patient: exportBuilderRows.patient.slice(0, 3),
				diagnosis: exportBuilderRows.diagnosis.slice(0, 3)
			}
		}
	);
	const { page, root } = state;
	const keys = () =>
		root
			.locator('thead th[data-column-key]')
			.evaluateAll((elements) => elements.map((element) => element.dataset.columnKey));
	const pairs = () =>
		root.locator('.preview-table').evaluate((table) => {
			const fields = [...table.querySelectorAll('thead th[data-column-key]')].map(
				(element) => element.dataset.columnKey
			);
			return [...table.querySelectorAll('tbody tr')].map((row) => {
				const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent);
				return ['patient.patID', 'diagnosis.tumorID'].map((key) => cells[fields.indexOf(key)]);
			});
		});
	assert.equal(await root.locator('#export-base').count(), 0);
	assert.equal(await root.locator('.export-settings select').count(), 0);
	assert.equal(await baseDataset(root), 'patient');
	assert.ok(await tableCheckbox(root, 'patient').isEnabled());
	assert.equal(
		await root.locator('#selection-patient').count(),
		0,
		'The automatic base is never reduced'
	);
	assert.deepEqual(await pairs(), [
		['DEMO-P01', 'DEMO-T01'],
		['DEMO-P01', 'DEMO-T02'],
		['DEMO-P02', 'DEMO-T03'],
		['DEMO-P03', '—']
	]);
	assert.ok(!(await keys()).includes('diagnosis.diagnosisDate'));
	const beforeModes = state.pageRequests.length;
	await root.locator('#selection-diagnosis').selectOption('first');
	assert.deepEqual(await pairs(), [
		['DEMO-P01', 'DEMO-T01'],
		['DEMO-P02', 'DEMO-T03'],
		['DEMO-P03', '—']
	]);
	await root.locator('#selection-diagnosis').selectOption('last');
	assert.deepEqual(await pairs(), [
		['DEMO-P01', 'DEMO-T02'],
		['DEMO-P02', 'DEMO-T03'],
		['DEMO-P03', '—']
	]);
	assert.equal(
		state.pageRequests.length,
		beforeModes,
		'First/Last diagnosis is selected per patient without reloading'
	);
	await root
		.locator('.alias-row input')
		.nth((await keys()).indexOf('diagnosis.tumorID'))
		.fill('Kept_tumor_alias');
	await root.locator('#join-diagnosis').selectOption('inner');
	await tableCheckbox(root, 'patient').uncheck();
	await waitReady(page);
	assert.equal(await baseDataset(root), 'diagnosis');
	assert.deepEqual(await keys(), ['diagnosis.tumorID', 'diagnosis.ICD.ICD10']);
	assert.deepEqual(
		await root
			.locator('.alias-row input')
			.evaluateAll((inputs) => inputs.map((input) => input.value)),
		['Kept_tumor_alias', 'ICD.ICD10']
	);
	assert.equal(await root.locator('tbody tr').count(), 3);
	await selectExportTables(page, root, ['patient']);
	assert.equal(await baseDataset(root), 'patient');
	assert.equal(await root.locator('#join-diagnosis').inputValue(), 'left');
	assert.equal(await root.locator('#selection-diagnosis').inputValue(), 'all');
	assert.equal(
		await root
			.locator('.alias-row input')
			.nth((await keys()).indexOf('diagnosis.tumorID'))
			.inputValue(),
		'Kept_tumor_alias'
	);
	assert.equal(await root.locator('tbody tr').count(), 4);
	cases.push({ name: 'auto-base-patient-diagnosis-first-last-and-preserved-aliases' });

	await setExportTables(page, root, []);
	assert.equal(await baseDataset(root), null);
	assert.equal(await root.locator('.field-module').count(), 0);
	assert.equal(await root.locator('.preview-table').count(), 0);
	assert.ok(await root.locator('.download-button').isDisabled());
	const beforeTherapy = state.pageRequests.length;
	await selectExportTables(page, root, ['therapy']);
	assert.equal(await baseDataset(root), 'therapy');
	assert.equal(await root.locator('#selection-therapy').count(), 0);
	assert.deepEqual(await keys(), ['therapy.generalType', 'therapy.therapyOccurrenceDate']);
	assert.deepEqual(
		[
			...new Set(
				state.pageRequests
					.slice(beforeTherapy)
					.filter((request) => request.operation === 'ExportDataset')
					.map((request) => request.name)
			)
		],
		['getAllTherapies']
	);
	assert.ok(await root.locator('.download-button').isEnabled());
	await selectExportTables(page, root, ['diagnosis']);
	assert.equal(
		await baseDataset(root),
		'diagnosis',
		'Catalogue precedence wins over checkbox click order'
	);
	assert.equal(await root.locator('.alias-row input').count(), 4);
	await root.locator('#join-therapy').selectOption('inner');
	await root.locator('#selection-therapy').selectOption('first');
	await selectExportTables(page, root, ['patient']);
	assert.equal(await baseDataset(root), 'patient');
	assert.equal(await root.locator('#join-therapy').inputValue(), 'inner');
	assert.equal(
		await root.locator('#selection-therapy').inputValue(),
		'first',
		'Adding an earlier root preserves settings on the unchanged diagnosis-to-therapy edge'
	);
	cases.push({ name: 'auto-base-empty-selection-therapy-only-and-catalogue-precedence' });
	await state.context.close();
}

async function selectionScenarios() {
	const therapy = (id, tumorID, date, label) => ({
		_id: id,
		therapyID: label,
		tumorID,
		patID: 'DEMO-P01',
		therapyOccurrenceDate: date,
		generalType: `Type_${label}`,
		protocol: `Protocol_${label}`
	});
	// Input order intentionally differs from chronology, including a tied earliest date.
	const therapyRows = [
		therapy('T1-Z-LATE', 'DEMO-T01', '2025-04-03', 'T1_LAST'),
		therapy('T2-Z-LATE', 'DEMO-T02', '2024-05-04', 'T2_LAST'),
		therapy('T1-Z-EARLY', 'DEMO-T01', '2025-01-02', 'T1_TIED'),
		therapy('T1-0-UNDATED', 'DEMO-T01', null, 'T1_UNDATED'),
		therapy('T2-A-EARLY', 'DEMO-T02', '2024-01-01', 'T2_FIRST'),
		therapy('T1-A-EARLY', 'DEMO-T01', '2025-01-02', 'T1_FIRST')
	];
	const radiationRows = therapyRows.flatMap((row, index) =>
		Array.from({ length: row.therapyID === 'T1_FIRST' ? 2 : 1 }, (_, child) => ({
			_id: row._id,
			therapyID: row.therapyID,
			tumorID: row.tumorID,
			patID: row.patID,
			areaDetailed: `Area_${row.therapyID}_${child + 1}`,
			totalDose: (index + 1) * 10 + child
		}))
	);
	const rows = {
		diagnosis: exportBuilderRows.diagnosis.slice(0, 3),
		therapy: therapyRows,
		radiation: radiationRows
	};
	const state = await createPage(false, { width: 1880, height: 920 }, { rows });
	const { page, root } = state;
	await setExportTables(page, root, ['diagnosis']);
	await selectExportTables(page, root, ['therapy', 'radiation']);
	const select = root.locator('#selection-therapy');
	const therapyBox = root.getByRole('checkbox', {
		name: 'Tabelle Therapien auswählen',
		exact: true
	});
	const fieldBox = (id) => root.locator(`#export-table-therapy label[title$="(${id})"] input`);
	const apiCount = () =>
		state.pageRequests.filter((request) => request.operation === 'ExportDataset').length;
	assert.equal(
		await root.locator('#selection-diagnosis').count(),
		0,
		'The base table has no reduction'
	);
	assert.equal(await select.inputValue(), 'all');
	assert.equal(
		await root.getByRole('combobox', { name: 'Einträge für Therapien', exact: true }).count(),
		1
	);
	assert.deepEqual(await select.locator('option').allTextContents(), ['Alle', 'Erster', 'Letzter']);
	for (const id of ['radiation']) {
		const unsupported = root.locator(`#selection-${id}`);
		assert.equal(await unsupported.inputValue(), 'all');
		assert.ok(await unsupported.locator('option[value="first"]').isDisabled());
		assert.ok(await unsupported.locator('option[value="last"]').isDisabled());
	}
	const requestsBefore = apiCount();
	await fieldBox('therapyOccurrenceDate').uncheck();
	await fieldBox('therapyID').check();
	await fieldBox('protocol').check();
	const fieldKeys = await root
		.locator('thead th[data-column-key]')
		.evaluateAll((elements) => elements.map((element) => element.dataset.columnKey));
	assert.ok(!fieldKeys.includes('therapy.therapyOccurrenceDate'));
	await root
		.locator('.alias-row input')
		.nth(fieldKeys.indexOf('therapy.therapyID'))
		.fill('chosen_therapy');
	const tupleKeys = [
		'diagnosis.tumorID',
		'therapy.therapyID',
		'therapy.generalType',
		'therapy.protocol',
		'radiation.areaDetailed',
		'radiation.totalDose'
	];
	const tuples = async () =>
		root.locator('.preview-table').evaluate((table, keys) => {
			const fields = [...table.querySelectorAll('thead th[data-column-key]')].map(
				(element) => element.dataset.columnKey
			);
			return [...table.querySelectorAll('tbody tr')].map((row) => {
				const values = [...row.querySelectorAll('td')].map((cell) => cell.textContent);
				return keys.map((key) => values[fields.indexOf(key)]);
			});
		}, tupleKeys);
	const expectedFor = (mode) =>
		['DEMO-T01', 'DEMO-T02'].flatMap((tumorID, index) => {
			const label = `T${index + 1}_${mode === 'first' ? 'FIRST' : 'LAST'}`;
			return radiationRows
				.filter((row) => row.therapyID === label)
				.map((row) => [
					tumorID,
					label,
					`Type_${label}`,
					`Protocol_${label}`,
					row.areaDetailed,
					String(row.totalDose)
				]);
		});
	const emptyTuple = ['DEMO-T03', '—', '—', '—', '—', '—'];
	for (const mode of ['first', 'last']) {
		await select.selectOption(mode);
		const expected = [...expectedFor(mode), emptyTuple];
		assert.deepEqual(
			await tuples(),
			expected,
			`${mode} keeps a complete child record per tumor before radiation joins`
		);
		assert.equal(await root.locator('#join-therapy').inputValue(), 'left');
		const downloadPromise = page.waitForEvent('download');
		await root.locator('.download-button').click();
		const download = await downloadPromise;
		const csvPath = path.join(out, `selection-${mode}.csv`);
		await download.saveAs(csvPath);
		const workbook = xlsx.read(fs.readFileSync(csvPath), { type: 'buffer', raw: true });
		const csvRows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
			header: 1,
			defval: ''
		});
		assert.ok(!csvRows[0].includes('therapyOccurrenceDate'));
		const tupleAliases = [
			'tumorID',
			'chosen_therapy',
			'generalType',
			'protocol',
			'areaDetailed',
			'totalDose'
		];
		assert.deepEqual(
			csvRows
				.slice(1)
				.map((row) => tupleAliases.map((alias) => String(row[csvRows[0].indexOf(alias)]))),
			expected.map((row) => row.map((value) => (value === '—' ? '' : value)))
		);
	}
	await root.locator('#join-therapy').selectOption('inner');
	assert.equal(
		await select.inputValue(),
		'last',
		'Required/optional is independent from chronology'
	);
	assert.deepEqual(await tuples(), expectedFor('last'));
	await root.locator('#join-therapy').selectOption('left');
	await select.selectOption('all');
	assert.match(await root.locator('.preview-footer').innerText(), /5 von 8 Zeilen/);
	assert.equal(
		apiCount(),
		requestsBefore,
		'Field changes and selection modes use the already loaded data'
	);
	cases.push({
		name: 'selection-per-parent-full-record-csv-unselected-date-downstream-and-no-refetch'
	});

	for (const language of ['de', 'en']) {
		if (language === 'en') {
			await page.evaluate(async (moduleUrl) => {
				const { locale } = await import(moduleUrl);
				locale.set('en');
			}, storeModuleUrls.get(page).languageStore);
		}
		const label = language === 'de' ? 'Einträge für Therapien' : 'Entries for Therapies';
		assert.equal(await root.getByRole('combobox', { name: label, exact: true }).count(), 1);
		assert.deepEqual(
			await select.locator('option').allTextContents(),
			language === 'de' ? ['Alle', 'Erster', 'Letzter'] : ['All', 'First', 'Last']
		);
		await root.locator('#export-table-therapy .connection-info button').focus();
		const info = page.locator('#export-connection-info-therapy');
		await info.waitFor({ state: 'visible' });
		const text = await info.innerText();
		assert.match(text, /therapyOccurrenceDate/);
		assert.match(text, language === 'de' ? /Therapiestart/ : /Therapy start/);
		assert.match(text, language === 'de' ? /Erster/ : /First/);
		assert.match(text, language === 'de' ? /Letzter/ : /Last/);
		await page.keyboard.press('Escape');
		await tableCheckbox(root, 'patient').focus();
	}
	cases.push({ name: 'selection-controls-and-chronology-info-localize' });
	await page.evaluate(async (moduleUrl) => {
		const { locale } = await import(moduleUrl);
		locale.set('de');
	}, storeModuleUrls.get(page).languageStore);
	await select.selectOption('first');
	await therapyBox.uncheck();
	await waitReady(page);
	await therapyBox.check();
	await waitReady(page);
	assert.equal(
		await select.inputValue(),
		'all',
		'Removing and re-adding a table clears its reduction'
	);
	await select.selectOption('last');
	await selectExportTables(page, root, ['patient']);
	assert.equal(await baseDataset(root), 'patient');
	assert.equal(
		await select.inputValue(),
		'last',
		'An unchanged directed edge retains its reduction'
	);
	await setExportTables(page, root, ['therapy', 'radiation']);
	assert.equal(await baseDataset(root), 'therapy');
	assert.equal(await root.locator('#selection-therapy').count(), 0);
	await selectExportTables(page, root, ['diagnosis']);
	assert.equal(
		await select.inputValue(),
		'all',
		'A disappeared edge does not revive its previous reduction'
	);
	await select.selectOption('first');
	await root.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
	await waitReady(page);
	assert.equal(await root.locator('#selection-therapy').count(), 0);
	await therapyBox.check();
	await waitReady(page);
	assert.equal(
		await select.inputValue(),
		'all',
		'Reset clears reductions for later table selection'
	);
	cases.push({ name: 'selection-preserves-unchanged-edges-and-clears-removed-edges-and-reset' });
	await state.context.close();

	for (const missing of ['undated-group', 'no-matches']) {
		const missingRows =
			missing === 'no-matches'
				? []
				: therapyRows.map((row) =>
						row.tumorID === 'DEMO-T01' ? { ...row, therapyOccurrenceDate: null } : row
				  );
		const unavailable = await createPage(
			false,
			{ width: 1600, height: 680 },
			{ rows: { ...rows, therapy: missingRows } }
		);
		await setExportTables(unavailable.page, unavailable.root, ['diagnosis']);
		await selectExportTables(unavailable.page, unavailable.root, ['therapy', 'radiation']);
		const unavailableSelect = unavailable.root.locator('#selection-therapy');
		assert.equal(await unavailableSelect.inputValue(), 'all');
		assert.ok(await unavailableSelect.locator('option[value="first"]').isDisabled());
		assert.ok(await unavailableSelect.locator('option[value="last"]').isDisabled());
		assert.ok(await unavailable.root.locator('.download-button').isEnabled());
		await unavailable.root.locator('#export-table-therapy .connection-info button').focus();
		const info = unavailable.page.locator('#export-connection-info-therapy');
		await info.waitFor({ state: 'visible' });
		assert.match(
			await info.innerText(),
			missing === 'no-matches'
				? /keine passenden|keine zugehörigen|keine.*Einträge/i
				: /Datum|Datumswerte/i
		);
		cases.push({ name: `selection-disabled-${missing}` });
		await unavailable.context.close();
	}
}

async function resetScenarios() {
	const columnKeys = (root) =>
		root
			.locator('thead th[data-column-key]')
			.evaluateAll((elements) => elements.map((element) => element.dataset.columnKey));
	const selected = (root) => root.locator('.catalogue-list input[type="checkbox"]:checked');
	const assertHeadings = async (root) => {
		assert.equal(await root.locator('.table-catalogue .headline-leading-icon').count(), 0);
		assert.equal(await root.locator('.preview-heading .headline-leading-icon').count(), 0);
		assert.equal(await root.locator('.preview-heading .headline-status').count(), 0);
	};
	for (const language of ['de', 'en']) {
		const state = await createPage(false, { width: 1600, height: 680 }, { language });
		const { page, root } = state;
		const resetName = language === 'de' ? 'Zurücksetzen' : 'Reset';
		const button = root.getByRole('button', { name: resetName, exact: true });
		const tooltip = root.locator('#export-reset-tooltip');
		assert.equal(await selected(root).count(), 2, 'Initial selection is tumors and patients');
		assert.equal(await root.locator('#export-base').count(), 0);
		assert.equal(await baseDataset(root), 'patient');
		assert.deepEqual(await columnKeys(root), [
			'patient.patID',
			'patient.gender',
			'diagnosis.tumorID',
			'diagnosis.ICD.ICD10'
		]);
		assert.equal(await root.locator('#export-table-patient').count(), 1);
		assert.equal(await root.locator('.table-catalogue .reset-button').count(), 1);
		assert.equal(await root.locator('.export-settings .reset-button').count(), 0);
		await assertHeadings(root);
		assert.match(await button.locator('img').getAttribute('src'), /\/trash-icon\.svg$/);
		assert.equal(
			(await button.innerText()).trim(),
			'',
			'Reset has an icon instead of visible text'
		);
		await button.hover();
		await tooltip.waitFor({ state: 'visible' });
		assert.equal(await tooltip.innerText(), resetName);
		await page.mouse.move(5, 5);
		await tableCheckbox(root, 'patient').focus();
		await tooltip.waitFor({ state: 'hidden' });
		await button.focus();
		await tooltip.waitFor({ state: 'visible' });
		assert.equal(await tooltip.innerText(), resetName);
		await tableCheckbox(root, 'patient').focus();
		await tooltip.waitFor({ state: 'hidden' });

		await selectExportTables(page, root, ['therapy', 'radiation']);
		await tableCheckbox(root, 'patient').uncheck();
		await waitReady(page);
		assert.equal(await baseDataset(root), 'diagnosis');
		await root.locator('#join-radiation').selectOption('inner');
		await root.locator('.alias-row input').first().fill('Custom_reset_name');
		const tumorHeader = root.locator('thead th[data-column-key="diagnosis.tumorID"]');
		await tumorHeader.locator('.column-actions button').nth(1).click();
		const requestsBefore = state.pageRequests.length;
		await button.click();
		await waitReady(page);
		assert.equal(await baseDataset(root), 'patient');
		assert.equal(await selected(root).count(), 2);
		assert.equal(await root.locator('.field-module').count(), 2);
		assert.equal(await root.locator('#export-table-diagnosis').count(), 1);
		assert.equal(await root.locator('#export-table-patient').count(), 1);
		assert.deepEqual(await columnKeys(root), [
			'patient.patID',
			'patient.gender',
			'diagnosis.tumorID',
			'diagnosis.ICD.ICD10'
		]);
		assert.deepEqual(
			await root
				.locator('.alias-row input')
				.evaluateAll((elements) => elements.map((element) => element.value)),
			['patID', 'gender', 'tumorID', 'ICD.ICD10']
		);
		assert.ok(await root.locator('.download-button').isEnabled());
		await assertHeadings(root);
		const resetRequests = state.pageRequests
			.slice(requestsBefore)
			.filter((request) => request.operation === 'ExportDataset');
		assert.ok(resetRequests.length > 0, 'Reset loads the remaining base data');
		assert.deepEqual([...new Set(resetRequests.map((request) => request.name))].sort(), [
			'getAllPatient',
			'getFirstAssessment'
		]);
		await page.mouse.move(5, 5);
		await tableCheckbox(root, 'patient').focus();
		await snapshot(page, root, `reset-tumors-and-patients-${language}-1600x680`);

		const radiationName =
			language === 'de'
				? 'Tabelle Einzelbestrahlungen auswählen'
				: 'Select table Individual radiation details';
		await root.getByRole('checkbox', { name: radiationName, exact: true }).check();
		await waitReady(page);
		assert.equal(
			await root.locator('#join-radiation').inputValue(),
			'left',
			'Reset clears the previous INNER join'
		);
		cases.push({
			name: `reset-clears-selection-alias-order-join-${language}`,
			requests: resetRequests.length
		});
		await state.context.close();
	}

	const fallback = await createPage(
		false,
		{ width: 1600, height: 680 },
		{
			env: { PUBLIC_NAV_DIAGNOSIS_ENABLED: 'false' }
		}
	);
	await setExportTables(fallback.page, fallback.root, ['radiation']);
	await fallback.root.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
	await waitReady(fallback.page);
	assert.equal(await baseDataset(fallback.root), 'patient');
	assert.equal(await selected(fallback.root).count(), 1);
	assert.equal(await fallback.root.locator('.field-module').count(), 1);
	assert.equal(await fallback.root.locator('#export-table-patient').count(), 1);
	assert.equal(await fallback.root.locator('#export-table-diagnosis').count(), 0);
	assert.deepEqual(await columnKeys(fallback.root), ['patient.patID', 'patient.gender']);
	cases.push({ name: 'reset-uses-one-permitted-fallback-when-diagnosis-disabled' });
	await fallback.context.close();

	const empty = await createPage(
		false,
		{ width: 1600, height: 680 },
		{
			env: { PUBLIC_NAV_EXPORT_ENABLED: 'false' }
		}
	);
	await empty.root.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
	await waitReady(empty.page);
	assert.equal(await baseDataset(empty.root), null);
	assert.equal(await selected(empty.root).count(), 0);
	assert.equal(await empty.root.locator('.field-module').count(), 0);
	assert.ok(await empty.root.locator('.download-button').isDisabled());
	assert.equal(
		empty.pageRequests.filter((request) => request.operation === 'ExportDataset').length,
		0
	);
	cases.push({ name: 'reset-keeps-unavailable-export-empty-without-data-requests' });
	await empty.context.close();
}

async function dataIntegrationScenarios() {
	const mandatoryFilter = {
		operand: 'AND',
		children: [{ system: 'patient', key: 'patID', type: 'EQUALS', value: 'DEMO-P01' }]
	};
	const scoped = await createPage(
		false,
		{ width: 1880, height: 920 },
		{
			mandatoryFilter,
			mandatoryPatient: 'DEMO-P01'
		}
	);
	await selectExportTables(scoped.page, scoped.root, ['therapy', 'radiation']);
	const scopedRequests = scoped.pageRequests.filter(
		(request) => request.operation === 'ExportDataset'
	);
	assert.ok(scopedRequests.length >= 8, 'Every explicitly selected table is paged until empty');
	for (const request of scopedRequests)
		assert.deepEqual(JSON.parse(request.args.filter), mandatoryFilter);
	assert.match(
		await scoped.root.locator('.preview-footer').innerText(),
		/Vorschau: 5 von 5 Zeilen/
	);
	assert.ok(!(await scoped.root.locator('tbody').innerText()).includes('DEMO-P02'));
	cases.push({
		name: 'mandatory-filter-propagates-to-every-export-page',
		requests: scopedRequests.length
	});
	await scoped.context.close();

	const failed = await createPage(
		false,
		{ width: 1880, height: 920 },
		{ failNext: 'getFirstAssessment' }
	);
	assert.match(await failed.root.getByRole('alert').innerText(), /Test: export API unavailable/);
	assert.ok(
		await failed.root.getByRole('button', { name: 'CSV herunterladen', exact: true }).isDisabled()
	);
	await failed.root.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
	await waitReady(failed.page);
	assert.equal(await failed.root.getByRole('alert').count(), 0);
	assert.ok(
		await failed.root.getByRole('button', { name: 'CSV herunterladen', exact: true }).isEnabled()
	);
	assert.equal(await failed.root.locator('tbody tr').count(), 5);
	cases.push({ name: 'api-error-disables-export-and-retry-recovers' });
	await failed.context.close();

	const stale = await createPage(false, { width: 1880, height: 920 });
	let release;
	let started;
	const startedPromise = new Promise((resolve) => {
		started = resolve;
	});
	const held = {
		name: 'getFirstAssessment',
		started,
		wait: new Promise((resolve) => {
			release = resolve;
		}),
		released: false
	};
	stale.controls.holdNext = held;
	const histogram = stale.root.getByRole('checkbox', {
		name: 'Tabelle Histologie auswählen',
		exact: true
	});
	await histogram.check();
	await startedPromise;
	assert.ok(
		await stale.root.getByRole('button', { name: 'CSV herunterladen', exact: true }).isDisabled()
	);
	await histogram.uncheck();
	await waitReady(stale.page);
	release();
	await held.wait;
	await stale.page.evaluate(() => new Promise(requestAnimationFrame));
	assert.equal(await stale.root.locator('#export-table-histology').count(), 0);
	assert.ok(!(await stale.root.innerText()).includes('STALE-RESULT'));
	assert.ok(
		await stale.root.getByRole('button', { name: 'CSV herunterladen', exact: true }).isEnabled()
	);
	cases.push({ name: 'superseded-api-response-cannot-replace-newer-table-selection' });

	const allBoxes = stale.root.locator('.catalogue-list input[type="checkbox"]:not(:disabled)');
	for (let index = 0; index < (await allBoxes.count()); index += 1) {
		await allBoxes.nth(index).check();
		await waitReady(stale.page);
	}
	assert.equal(await stale.root.getByRole('alert').count(), 0);
	assert.ok(
		await stale.root.getByRole('button', { name: 'CSV herunterladen', exact: true }).isEnabled()
	);
	const loaded = new Set(
		stale.pageRequests
			.filter((request) => request.operation === 'ExportDataset')
			.map((request) => request.name)
	);
	assert.equal(loaded.size, 14, 'All 14 Demo datasets load through the authenticated API path');
	assert.ok(!loaded.has('getBioMaterial'), 'CCP-only biomaterial is never loaded in Demo');
	cases.push({ name: 'all-fourteen-demo-datasets-load-from-api-fixtures' });
	await stale.context.close();
}

async function columnsScenarios() {
	const longValue =
		'Linke Brust: ' +
		'Synthetische ausführliche Zielgebietsbeschreibung mit erhaltenem Volltext. '.repeat(15);
	const state = await createPage(
		false,
		{ width: 1880, height: 920 },
		{ longPreviewValue: longValue }
	);
	const { page, root } = state;
	await selectExportTables(page, root, ['therapy', 'radiation']);
	const headers = root.locator('thead th[data-column-key]');
	const aliases = root.locator('.alias-row input');
	const keys = () =>
		headers.evaluateAll((elements) => elements.map((element) => element.dataset.columnKey));
	const header = (key) => root.locator(`thead th[data-column-key="${key}"]`);
	const initialKeys = await keys();
	assert.equal(initialKeys.length, 8);
	const longIndex = initialKeys.indexOf('radiation.areaDetailed');
	const longCell = root.locator('tbody tr').first().locator('td .cell-value').nth(longIndex);
	assert.equal(await longCell.getAttribute('title'), longValue);
	assert.equal(await longCell.textContent(), longValue);
	const clipping = await longCell.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			textOverflow: style.textOverflow,
			overflow: style.overflow,
			whiteSpace: style.whiteSpace,
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth
		};
	});
	assert.equal(clipping.textOverflow, 'ellipsis');
	assert.equal(clipping.overflow, 'hidden');
	assert.equal(clipping.whiteSpace, 'nowrap');
	assert.ok(clipping.scrollWidth > clipping.clientWidth);
	assert.ok(clipping.clientWidth <= 180, 'The long value does not widen its column');
	assert.equal(
		await root
			.locator('.preview-table')
			.evaluate((element) => getComputedStyle(element).tableLayout),
		'fixed'
	);
	assert.equal(
		await aliases.evaluateAll((elements) => elements.some((element) => element.draggable)),
		false,
		'Alias inputs remain normal editable inputs'
	);
	await aliases.nth(1).fill('Cancer_code_custom');
	const initialAliases = await aliases.evaluateAll((elements) =>
		elements.map((element) => element.value)
	);
	const initialRows = await root
		.locator('tbody tr')
		.evaluateAll((rows) =>
			rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent))
		);
	const aliasByKey = Object.fromEntries(
		initialKeys.map((key, index) => [key, initialAliases[index]])
	);
	const rowByKey = initialRows.map((values) =>
		Object.fromEntries(initialKeys.map((key, index) => [key, values[index]]))
	);
	const assertOrder = async (expected) => {
		assert.deepEqual(await keys(), expected);
		assert.deepEqual(
			await aliases.evaluateAll((elements) => elements.map((element) => element.value)),
			expected.map((key) => aliasByKey[key])
		);
		assert.deepEqual(
			await root
				.locator('tbody tr')
				.evaluateAll((rows) =>
					rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent))
				),
			rowByKey.map((row) => expected.map((key) => row[key]))
		);
	};
	const rearrange = (order, source, target, after) => {
		const next = order.filter((key) => key !== source);
		next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source);
		return next;
	};
	const drag = async (source, target, after) => {
		const targetHeader = header(target);
		const bounds = await targetHeader.boundingBox();
		await header(source)
			.locator('.column-heading-label')
			.dragTo(targetHeader, {
				targetPosition: { x: bounds.width * (after ? 0.75 : 0.25), y: bounds.height / 2 }
			});
	};
	const draggedKey = initialKeys[1];
	await drag(draggedKey, initialKeys[5], true);
	let expected = rearrange(initialKeys, draggedKey, initialKeys[5], true);
	await assertOrder(expected);
	await drag(draggedKey, initialKeys[0], false);
	expected = rearrange(expected, draggedKey, initialKeys[0], false);
	await assertOrder(expected);
	cases.push({ name: 'columns-native-drag-moves-custom-alias-and-values-both-directions' });

	const transfer = await page.evaluateHandle(() => new DataTransfer());
	await header(draggedKey)
		.locator('.column-heading-label')
		.dispatchEvent('dragstart', { dataTransfer: transfer });
	await header(draggedKey)
		.locator('.column-heading-label')
		.dispatchEvent('dragend', { dataTransfer: transfer });
	await assertOrder(expected);
	const external = await page.evaluateHandle(() => {
		const value = new DataTransfer();
		value.setData('text/plain', 'diagnosis.tumorID');
		return value;
	});
	const targetBox = await header(initialKeys[5]).boundingBox();
	await header(initialKeys[5]).dispatchEvent('dragover', {
		dataTransfer: external,
		clientX: targetBox.x + targetBox.width * 0.75,
		clientY: targetBox.y + 5
	});
	await header(initialKeys[5]).dispatchEvent('drop', {
		dataTransfer: external,
		clientX: targetBox.x + targetBox.width * 0.75,
		clientY: targetBox.y + 5
	});
	await assertOrder(expected);
	await transfer.dispose();
	await external.dispose();
	await header(draggedKey).locator('.column-actions button').nth(1).click();
	[expected[0], expected[1]] = [expected[1], expected[0]];
	await assertOrder(expected);
	await header(draggedKey).locator('.column-actions button').nth(1).click();
	[expected[1], expected[2]] = [expected[2], expected[1]];
	await assertOrder(expected);
	assert.notDeepEqual(
		expected,
		initialKeys,
		'CSV verification must use a genuinely changed column order'
	);
	cases.push({ name: 'columns-canceled-and-external-drags-preserve-order-and-arrows-still-work' });

	const downloadPromise = page.waitForEvent('download');
	await root.locator('.download-button').click();
	const download = await downloadPromise;
	const csvPath = path.join(out, 'columns-reordered-full-values.csv');
	await download.saveAs(csvPath);
	const workbook = xlsx.read(fs.readFileSync(csvPath), { type: 'buffer', raw: true });
	const csvRows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
		header: 1,
		defval: ''
	});
	assert.deepEqual(
		csvRows[0],
		expected.map((key) => aliasByKey[key])
	);
	assert.equal(csvRows.length - 1, 10);
	assert.equal(csvRows[1][expected.indexOf('radiation.areaDetailed')], longValue);
	assert.deepEqual(
		csvRows.slice(1, 6).map((row) => row.map(String)),
		rowByKey.map((row) => expected.map((key) => (row[key] === '—' ? '' : row[key])))
	);
	cases.push({
		name: 'columns-csv-preserves-complete-long-value-and-dragged-column-order',
		clipping,
		csvPath
	});
	await snapshot(page, root, 'columns-long-value-reordered');
	await state.context.close();

	const short = await createPage(
		false,
		{ width: 1600, height: 680 },
		{ longPreviewValue: longValue }
	);
	await selectExportTables(short.page, short.root, ['therapy', 'radiation']);
	const scroll = short.root.locator('.preview-scroll');
	assert.ok(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth));
	await scroll.hover();
	await short.page.mouse.wheel(1500, 0);
	await short.page.waitForFunction(() => document.querySelector('.preview-scroll').scrollLeft > 0);
	await snapshot(short.page, short.root, 'columns-1600x680-horizontal-scroll');
	await short.context.close();
}

async function localizationScenarios() {
	// Only the disposable context's Svelte locale changes; no profile/account setting is saved.
	const switchLocale = async (page, language) => {
		const moduleUrl = storeModuleUrls.get(page)?.languageStore;
		assert.ok(moduleUrl, 'The actual loaded locale module URL was observed');
		await page.evaluate(
			async ({ next, moduleUrl }) => {
				const { locale } = await import(moduleUrl);
				locale.set(next);
			},
			{ next: language, moduleUrl }
		);
		await page.waitForFunction((next) => {
			const text = document.querySelector('.download-button')?.textContent || '';
			return next === 'en'
				? /download.*csv|csv.*download/i.test(text)
				: /CSV herunterladen/.test(text);
		}, language);
	};
	const state = await createPage(false, { width: 1880, height: 920 }, { language: 'de' });
	const { page, root } = state;
	await selectExportTables(page, root, ['therapy', 'radiation']);
	const aliases = root.locator('.alias-row input');
	const headersBefore = await aliases.evaluateAll((inputs) => inputs.map((input) => input.value));
	await aliases.first().fill('My_tumor_key');
	headersBefore[0] = 'My_tumor_key';
	const dateColumn = headersBefore.indexOf('therapyOccurrenceDate');
	assert.ok(dateColumn >= 0, 'The added therapy table supplies a date column');
	const dateCell = root.locator('tbody tr').first().locator('td').nth(dateColumn);
	assert.equal(
		await dateCell.innerText(),
		new Date('2025-03-10').toLocaleDateString('de-DE', { timeZone: 'UTC' })
	);
	const apiCount = state.pageRequests.filter(
		(request) => request.operation === 'ExportDataset'
	).length;
	await switchLocale(page, 'en');
	assert.match(
		await root.locator('.preview-heading .headline-title').innerText(),
		/export preview/i
	);
	assert.equal(await root.locator('#export-table-patient .headline-title').innerText(), 'Patients');
	assert.equal(await root.locator('#export-table-diagnosis .headline-title').innerText(), 'Tumors');
	assert.equal(
		await root.locator('#export-table-radiation .headline-title').innerText(),
		'Individual radiation details'
	);
	const patientFields = await root.locator('#export-table-patient .field-label').allTextContents();
	assert.ok(patientFields.includes('Gender'));
	assert.ok(patientFields.includes('Birth date'));
	assert.ok(!patientFields.includes('Geschlecht'));
	assert.equal(
		await dateCell.innerText(),
		new Date('2025-03-10').toLocaleDateString('en-US', { timeZone: 'UTC' })
	);
	assert.deepEqual(
		await aliases.evaluateAll((inputs) => inputs.map((input) => input.value)),
		headersBefore
	);
	assert.equal(
		state.pageRequests.filter((request) => request.operation === 'ExportDataset').length,
		apiCount,
		'Changing language does not reload clinical data'
	);
	assert.equal(await root.locator('#export-table-search').count(), 0);
	cases.push({ name: 'localization-labels-dates-and-aliases-switch-without-refetch' });
	const secondAlias = aliases.nth(1);
	await secondAlias.fill('My_tumor_key');
	assert.match(await root.getByRole('alert').innerText(), /unique/i);
	assert.ok(await root.locator('.download-button').isDisabled());
	await switchLocale(page, 'de');
	assert.match(await root.getByRole('alert').innerText(), /eindeutig/i);
	await secondAlias.fill(headersBefore[1]);
	await switchLocale(page, 'en');
	const downloadPromise = page.waitForEvent('download');
	await root.locator('.download-button').click();
	const download = await downloadPromise;
	const csvPath = path.join(out, 'localized-english-export.csv');
	await download.saveAs(csvPath);
	const workbook = xlsx.read(fs.readFileSync(csvPath), { type: 'buffer', raw: true });
	const csvRows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
		header: 1,
		defval: ''
	});
	assert.deepEqual(
		csvRows[0],
		headersBefore,
		'Custom alias and technical default headers survive locale changes'
	);
	assert.equal(
		csvRows[1][dateColumn],
		new Date('2025-03-10').toLocaleDateString('en-US', { timeZone: 'UTC' })
	);
	assert.equal(csvRows.length - 1, 10, 'All joined rows export in the active language');
	cases.push({ name: 'localization-duplicate-error-and-csv-headers-preserve-user-names' });

	let release;
	let started;
	const start = new Promise((resolve) => {
		started = resolve;
	});
	state.controls.holdNext = {
		name: 'getFirstAssessment',
		started,
		wait: new Promise((resolve) => {
			release = resolve;
		})
	};
	const histology = root
		.locator('.catalogue-item')
		.filter({ hasText: /Histology/ })
		.getByRole('checkbox');
	await histology.check();
	await start;
	assert.match(await root.locator('.preview-summary').innerText(), /loading/i);
	await switchLocale(page, 'de');
	assert.match(await root.locator('.preview-summary').innerText(), /geladen|Laden/i);
	release();
	await waitReady(page);
	cases.push({ name: 'localization-inflight-loading-message-reacts-to-language-switch' });
	await state.context.close();

	const failed = await createPage(
		false,
		{ width: 1880, height: 920 },
		{ language: 'en', failNext: 'getFirstAssessment' }
	);
	assert.match(
		await failed.root.getByRole('alert').innerText(),
		/could not.*load|failed.*load|load.*failed|unable.*load/i
	);
	await switchLocale(failed.page, 'de');
	assert.match(
		await failed.root.getByRole('alert').innerText(),
		/nicht.*geladen|Laden.*fehlgeschlagen/i
	);
	assert.ok(await failed.root.locator('.download-button').isDisabled());
	const retry = failed.root.getByRole('alert').getByRole('button');
	await retry.click();
	await waitReady(failed.page);
	assert.equal(await failed.root.getByRole('alert').count(), 0);
	cases.push({ name: 'localization-existing-api-error-retranslates-and-retry-recovers' });
	await failed.context.close();
}

async function availabilityScenarios() {
	const clinicalFlags = [
		'PATIENT_COHORT',
		'PATIENT_SINGLE',
		'DIAGNOSIS',
		'TNM',
		'THERAPY_GENERAL',
		'THERAPY_OPERATION',
		'THERAPY_SYSTEMIC',
		'THERAPY_RADIATION',
		'THERAPY_NUCLEAR',
		'THERAPY_OTHER',
		'PROGRESS',
		'TUMORBOARD',
		'CONSULTATION',
		'STATUS',
		'SURVIVAL',
		'SUPPLEMENTARY',
		'MOLECULAR',
		'BIO_MATERIAL',
		'STUDY'
	];
	const allEnabled = Object.fromEntries(
		clinicalFlags.map((key) => [`PUBLIC_NAV_${key}_ENABLED`, 'true'])
	);
	const visible = async (root, id, label, expected) => {
		assert.equal(
			await root.getByRole('checkbox', { name: `Tabelle ${label} auswählen`, exact: true }).count(),
			expected ? 1 : 0
		);
		if (!expected) {
			assert.equal(await root.locator(`#export-table-${id}`).count(), 0);
			assert.equal(await root.locator(`input[aria-label^="Exportname für ${label}."]`).count(), 0);
		}
	};
	for (const importMode of ['demo', 'ccp']) {
		const state = await createPage(
			false,
			{ width: 1880, height: 920 },
			{
				env: { ...allEnabled, PUBLIC_IMPORT_MODE: importMode, PUBLIC_NAV_EXPORT_ENABLED: 'true' }
			}
		);
		await visible(state.root, 'bioMaterial', 'Biomaterial', importMode === 'ccp');
		await visible(state.root, 'studyPatient', 'Studie', importMode === 'demo');
		await visible(state.root, 'consultation', 'Beratungen', importMode === 'demo');
		assert.equal(
			await state.root.locator('.catalogue-list input[type="checkbox"]').count(),
			importMode === 'demo' ? 14 : 13
		);
		if (importMode === 'ccp') {
			await setExportTables(state.page, state.root, ['bioMaterial']);
			assert.equal(await baseDataset(state.root), 'bioMaterial');
			await state.page.evaluate(async (moduleUrl) => {
				const { variantStore } = await import(moduleUrl);
				variantStore.update((value) => ({ ...value, isCCP: false, importMode: 'demo' }));
			}, storeModuleUrls.get(state.page).variantStore);
			await waitReady(state.page);
			await visible(state.root, 'bioMaterial', 'Biomaterial', false);
			assert.equal(await baseDataset(state.root), 'patient');
			await state.root.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
			await waitReady(state.page);
			await visible(state.root, 'bioMaterial', 'Biomaterial', false);
		}
		cases.push({ name: `availability-${importMode}-variant-and-active-base-reconciliation` });
		await state.context.close();

		const disabled = await createPage(
			false,
			{ width: 1880, height: 920 },
			{
				env: {
					...allEnabled,
					PUBLIC_IMPORT_MODE: importMode,
					PUBLIC_NAV_BIO_MATERIAL_ENABLED: 'false',
					PUBLIC_NAV_STUDY_ENABLED: 'off'
				}
			}
		);
		await visible(disabled.root, 'bioMaterial', 'Biomaterial', false);
		await visible(disabled.root, 'studyPatient', 'Studie', false);
		cases.push({ name: `availability-${importMode}-explicit-disabled-flags-win` });
		await disabled.context.close();
	}

	const restricted = await createPage(
		false,
		{ width: 1880, height: 920 },
		{
			env: {
				...allEnabled,
				PUBLIC_IMPORT_MODE: 'demo',
				PUBLIC_NAV_DIAGNOSIS_ENABLED: 'false',
				PUBLIC_NAV_THERAPY_GENERAL_ENABLED: 'false'
			}
		}
	);
	assert.equal(await baseDataset(restricted.root), 'patient');
	for (const [id, label] of [
		['diagnosis', 'Tumore'],
		['histology', 'Histologie'],
		['therapy', 'Therapien']
	]) {
		await visible(restricted.root, id, label, false);
	}
	await visible(restricted.root, 'radiation', 'Einzelbestrahlungen', true);
	assert.equal(await restricted.root.locator('.field-module').count(), 1);
	await selectExportTables(restricted.page, restricted.root, ['radiation']);
	assert.equal(await restricted.root.locator('#export-table-radiation').count(), 1);
	assert.ok(
		await restricted.root
			.getByRole('button', { name: 'CSV herunterladen', exact: true })
			.isEnabled()
	);
	await setExportTables(restricted.page, restricted.root, ['radiation']);
	await restricted.root.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
	await waitReady(restricted.page);
	assert.equal(await baseDataset(restricted.root), 'patient');
	assert.equal(await restricted.root.locator('.field-module').count(), 1);
	await visible(restricted.root, 'diagnosis', 'Tumore', false);
	await visible(restricted.root, 'therapy', 'Therapien', false);
	cases.push({ name: 'availability-disabled-base-fallback-reset-and-hidden-bridge-cards' });
	await restricted.context.close();

	for (const exportDisabled of [false, true]) {
		const empty = await createPage(
			false,
			{ width: 1880, height: 920 },
			{
				env: exportDisabled
					? { ...allEnabled, PUBLIC_NAV_EXPORT_ENABLED: 'false' }
					: Object.fromEntries(clinicalFlags.map((key) => [`PUBLIC_NAV_${key}_ENABLED`, 'false']))
			}
		);
		assert.equal(await empty.root.locator('.catalogue-list input[type="checkbox"]').count(), 0);
		assert.equal(await empty.root.locator('.field-module').count(), 0);
		assert.equal(await empty.root.locator('#export-base').count(), 0);
		assert.ok(
			await empty.root.getByRole('button', { name: 'CSV herunterladen', exact: true }).isDisabled()
		);
		assert.equal(
			empty.pageRequests.filter((request) => request.operation === 'ExportDataset').length,
			0
		);
		cases.push({
			name: exportDisabled
				? 'availability-export-disabled-makes-no-data-requests'
				: 'availability-all-clinical-flags-disabled-makes-no-data-requests'
		});
		await empty.context.close();
	}
}

let failure;
try {
	if (autoBaseOnly) {
		await autoBaseScenarios();
	} else if (selectionOnly) {
		await selectionScenarios();
	} else if (resetOnly) {
		await resetScenarios();
	} else if (columnsOnly) {
		await columnsScenarios();
	} else if (localizationOnly) {
		await localizationScenarios();
	} else if (availabilityOnly) {
		await availabilityScenarios();
	} else if (layoutOnly) {
		await layoutScenarios();
	} else {
		await layoutScenarios();
		const { context, page, root } = await createPage(false, { width: 1880, height: 920 });
		await interactions(page, root);
		await context.close();
		await dataIntegrationScenarios();
	}
	assert.deepEqual(errors, [], 'No browser errors');
	assert.deepEqual(blockedOrigins, [], 'No requests attempted outside the isolated app');
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
				consoleMessages,
				requests
			},
			null,
			2
		)
	);
	await browser.close();
}
if (failure) throw failure;
console.log(`PASS ${cases.length} export builder scenarios; reports in ${out}`);
