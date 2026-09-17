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
const out = path.resolve(process.env.OVIS_TEST_OUTPUT || 'table-resize-results');
fs.mkdirSync(out, { recursive: true });
const mobile = process.argv.includes('--mobile');
const browser = await chromium.launch({
	headless: true,
	...(process.env.OVIS_CHROMIUM ? { executablePath: process.env.OVIS_CHROMIUM } : {})
});
const context = await browser.newContext({
	viewport: mobile ? { width: 1280, height: 700 } : { width: 1900, height: 1050 },
	timezoneId: 'Europe/Berlin',
	...(mobile ? { isMobile: true, hasTouch: true, screen: { width: 1280, height: 700 } } : {})
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [],
	requests = [],
	cases = [];
let total = 101;
page.on('pageerror', (e) => errors.push(e.stack));
page.on('dialog', (dialog) => {
	errors.push(dialog.message());
	dialog.dismiss();
});
const stored = {
	currentUser: 'synthetic-table-resize',
	currentRole: 'user',
	currentLanguage: 'en',
	currentTheme: false,
	primaryColorRGB: { r: 0, g: 128, b: 80 },
	primaryColor: '#008050',
	colorPalette: ['#008050', '#229966'],
	paletteName: 'CCCMunich',
	darkMode: false,
	chartShowTop5: false,
	chartHideNullValues: false,
	pseudonymization: false,
	currentFilter: '',
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
const records = Array.from({ length: 101 }, (_, i) => ({
	_id: `synthetic-${i}`,
	patID: `SYNTHETIC-P${i}`,
	tumorID: `SYNTHETIC-T${i}`,
	therapyID: i < 3 ? `SYNTHETIC-THREE${i}` : `SYNTHETIC-H${i}`,
	firstName: 'Synthetic',
	lastName: `Case ${i}`,
	gender: 'm',
	birthDate: Date.UTC(1960, 0, 1),
	postalCode: '80000',
	area: 'Muenchen',
	countryCode: 'DE',
	vitalDate: Date.UTC(2026, 0, 1),
	vitalState: 'alive',
	diagnosisDate: Date.UTC(2024, 5, 15),
	ageAtDiagnosis: 60,
	ICD: { ICD10: 'C34.1' },
	ICDO_histologyCode: '8140/3',
	ICDO_histologyCodeText: 'Synthetic histology',
	ICDO_grading: 'G2',
	ICDO_source: 'synthetic',
	ICDO_histologyDate: Date.UTC(2026, 0, 1),
	ICDO_mixedTumor: false,
	investigationMethod: 'Synthetic biopsy',
	diagnosticOccurrenceDate: Date.UTC(2026, 0, 1),
	generalType: 'systemic',
	therapyOccurrenceDate: Date.UTC(2025, 5, 1),
	therapyEndDate: Date.UTC(2025, 6, 1),
	therapyDaysSinceDiagnosis: 100,
	intention: 'K',
	surgeryContext: '',
	complication: [],
	terminationReason: '',
	status: 'Synthetic',
	internal: 'unknown',
	organizationalUnit: '',
	reportID: '',
	studyID: `SYNTHETIC-S${i}`,
	shortname: `Synthetic study ${i}`,
	start: Date.UTC(2024, 0, 1),
	firstPatInPlanned: Date.UTC(2024, 0, 1),
	phase: 'II',
	eudract: '',
	organisationFull: 'Synthetic clinic',
	organisationShort: 'SYN',
	studyPatients: [{ patID: `SYNTHETIC-P${i}` }],
	recruitmentDate: Date.UTC(2025, 0, 1)
}));
function matchingRows(args) {
	return records.slice(0, total).filter((row) =>
		(args.columnFilters ?? []).every(({ field, value }) =>
			String(row[field] ?? '')
				.toLowerCase()
				.includes(String(value).toLowerCase())
		)
	);
}
function respond(name, args) {
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
				role: 'user',
				status: 'active',
				language: 'en',
				firstLogin: Date.now(),
				darkMode: false,
				userFilter: [''],
				filter: ''
			}
		];
	if (name === 'getLastMetaData') return { executedAt: Date.now() };
	if (name.startsWith('update') || name === 'recordUsageEvents') return { acknowledged: true };
	if (name === 'getQuicktoolsBasicsIcd10') return ['C34 → Lung'];
	if (name === 'getQuicktoolsBasicsHistology') return ['8140/3 → Synthetic'];
	if (name === 'getQuicktoolsCountOverview')
		return ['patient', 'diagnosis', 'therapy', 'progress'].map((collection) => ({
			collection,
			count: total
		}));
	if (name === 'getTableCount') return matchingRows(args).length;
	if (name === 'getPatientCohortGenderChart') return { label: ['m'], count: [total] };
	if (name === 'getPatientCohortDeathChart') return { label: ['alive'], count: [total] };
	if (name === 'getPatientCohortAgeChart') return [{ ageAtDiagnosis: 60, count: total }];
	if (name === 'getPatientCohortMapChart')
		return [{ label: 'Deutschland', description: 'Deutschland', count: total }];
	if (name === 'getTumors')
		return {
			category: ['2024'],
			groups: [{ label: 'C30-C39', description: 'Synthetic', gender: 'm', count: [total] }]
		};
	if (name === 'getCategoryChart') return { label: ['Synthetic'], count: [total] };
	if (name === 'getTherapyGeneralComplicationChart') return { category: [], groups: [] };
	if (name === 'getStudyPatientChart')
		return [{ shortname: 'Synthetic study', studyPatients: total }];
	if (name === 'getValueOptions') return [];
	if (/Table|AllPatient|AllTherapies|AllStudies/.test(name))
		return matchingRows(args).slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 6));
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
	if (url.pathname.includes('/api/keycloak/'))
		return route.fulfill({
			json: { active: true, preferred_username: stored.currentUser, ...stored.keycloakTokens }
		});
	if (url.pathname === '/api/catalogue')
		return route.fulfill({
			json: {
				data: [],
				revision: 'synthetic-1',
				source: 'synthetic fixture',
				timestamp: Date.now(),
				size: 0
			}
		});
	if (url.pathname.endsWith('/graphql')) {
		const body = req.postDataJSON(),
			ast = parse(body.query),
			data = {};
		for (const def of ast.definitions)
			if (def.selectionSet)
				for (const field of def.selectionSet.selections) {
					const name = field.name.value;
					const args = {
						...body.variables,
						...Object.fromEntries(
							(field.arguments ?? []).map((arg) => [
								arg.name.value,
								valueFromASTUntyped(arg.value, body.variables)
							])
						)
					};
					requests.push({ name, args, at: Date.now() });
					data[field.alias?.value ?? name] = completeSelection(
						respond(name, args),
						field.selectionSet
					);
				}
		return route.fulfill({ json: { data } });
	}
	return route.continue();
});
const targets = [
	{ route: '/therapy-general', id: 'generic_therapyGeneralTable', query: 'getAllTherapies' },
	{
		route: '/diagnosis',
		id: 'generic_diagnosisHistologyTable',
		query: 'getDiagnosisHistologyTable'
	},
	{ route: '/study', id: 'generic_studyOverviewTable', query: 'getAllStudies' },
	{ route: '/patient-cohort', id: 'generic_patientCohortOverviewTable', query: 'getAllPatient' }
];
function targetRequests(target) {
	return requests.filter(
		(request) => request.name === target.query && Number.isInteger(request.args.offset)
	);
}
async function state(target) {
	return page.locator(`#${target.id}`).evaluate((table) => ({
		rows: table.querySelectorAll('tbody tr:not(:has(td.dataTables_empty))').length,
		info: document.querySelector(`#${table.id}_info`)?.textContent,
		mobileLayout: document.documentElement.dataset.ovisMobileLayout,
		coarsePointer: window.matchMedia('(pointer: coarse)').matches,
		screen: { width: window.screen.width, height: window.screen.height },
		orientation: window.screen.orientation?.type,
		draws: table.__resizeTestDraws ?? 0,
		height: table.getBoundingClientRect().height,
		panelHeight: table.closest('.box_level2')?.getBoundingClientRect().height
	}));
}
async function stable(target, name) {
	await page.waitForTimeout(550);
	await page.locator(`#${target.id}`).evaluate((table) => {
		if (table.__resizeTestObserver) return;
		table.__resizeTestDraws = 0;
		table.__resizeTestObserver = new MutationObserver(() => {
			table.__resizeTestDraws++;
		});
		table.__resizeTestObserver.observe(table.querySelector('tbody'), {
			childList: true,
			subtree: true,
			characterData: true
		});
	});
	const firstRequests = targetRequests(target).length,
		samples = [];
	for (let i = 0; i < 6; i++) {
		samples.push(await state(target));
		await page.waitForTimeout(250);
	}
	const lastRequests = targetRequests(target),
		latest = lastRequests.at(-1);
	assert.ok(latest, `${name}: actual paginated table request observed`);
	const filteredTotal = matchingRows(latest.args).length;
	const record = {
		name,
		samples,
		requests: lastRequests.map((request) => ({
			limit: request.args.limit,
			offset: request.args.offset
		})),
		total,
		filteredTotal
	};
	cases.push(record);
	if (mobile) {
		assert.ok(
			samples.every((sample) => sample.coarsePointer),
			`${name}: real touch pointer is emulated`
		);
		assert.ok(
			samples.every((sample) => Math.min(sample.screen.width, sample.screen.height) <= 900),
			`${name}: phone-sized screen remains emulated`
		);
		assert.ok(
			samples.every((sample) => sample.mobileLayout === 'landscape'),
			`${name}: actual mobile landscape layout stays active`
		);
	}
	assert.equal(
		new Set(samples.map((sample) => `${sample.rows}:${sample.info}`)).size,
		1,
		`${name}: rows/page info changed while idle`
	);
	assert.equal(
		new Set(samples.map((sample) => sample.draws)).size,
		1,
		`${name}: table redraws continued while idle`
	);
	assert.equal(lastRequests.length, firstRequests, `${name}: continuing table requests while idle`);
	assert.ok(
		Number.isInteger(latest.args.limit) && latest.args.limit >= 1 && latest.args.limit <= 50,
		`${name}: bounded positive page size`
	);
	assert.equal(
		samples[0].rows,
		Math.max(0, Math.min(latest.args.limit, filteredTotal - (latest.args.offset ?? 0))),
		`${name}: rendered rows match the requested page`
	);
	assert.ok(
		samples[0].info.includes(`of ${filteredTotal.toLocaleString('en-US')} entries`),
		`${name}: filtered count is preserved`
	);
	console.log(
		'PASS',
		name,
		JSON.stringify({ rows: samples[0].rows, limit: latest.args.limit, info: samples[0].info })
	);
	return latest.args.limit;
}
async function toggle(target) {
	const panel = page
		.locator(`#${target.id}`)
		.locator(
			'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " box_level2 ")][1]'
		);
	await panel
		.locator('button')
		.filter({ has: page.locator('img[alt="Toggle"]') })
		.click();
}
async function run(target, viewport, count) {
	total = count;
	await page.setViewportSize(viewport);
	const name = `${target.id}-${viewport.width}x${viewport.height}-${total}`;
	const errorStart = errors.length;
	try {
		await page.goto(base + target.route);
		await page.locator(`#${target.id}_info`).waitFor();
		const acceptDisclaimer = page.getByRole('button', { name: 'Accept', exact: true });
		if (await acceptDisclaimer.count()) await acceptDisclaimer.click();
		if (mobile)
			await page.waitForFunction(
				() => document.documentElement.dataset.ovisMobileLayout === 'landscape'
			);
		const normal = await stable(target, `${name}-normal`);
		await toggle(target);
		const maximized = await stable(target, `${name}-maximized`);
		if (count > normal)
			assert.ok(
				maximized > normal,
				`${name}: maximizing must increase page capacity (${normal} -> ${maximized})`
			);
		await toggle(target);
		const minimized = await stable(target, `${name}-minimized`);
		assert.equal(minimized, normal, `${name}: minimizing restores page capacity`);
		await toggle(target);
		assert.equal(
			await stable(target, `${name}-maximized-again`),
			maximized,
			`${name}: second maximize is stable`
		);
		if (count > 50 && !mobile && !process.argv.includes('--baseline')) {
			const resized = { width: viewport.width, height: viewport.height === 1050 ? 760 : 1050 };
			await page.setViewportSize(resized);
			const resizedLimit = await stable(target, `${name}-resized-maximized`);
			assert.ok(
				resized.height < viewport.height ? resizedLimit < maximized : resizedLimit > maximized,
				`${name}: page capacity follows viewport height`
			);
			await toggle(target);
			await stable(target, `${name}-resized-normal`);
			await toggle(target);
			assert.equal(
				await stable(target, `${name}-resized-maximized-again`),
				resizedLimit,
				`${name}: resize and maximize remain stable`
			);
			await page.setViewportSize(viewport);
			assert.equal(
				await stable(target, `${name}-viewport-restored`),
				maximized,
				`${name}: restoring viewport restores page capacity`
			);
		}
		if (count > 50) {
			await page
				.locator(`#${target.id}_paginate a.paginate_button:not(.previous):not(.next)`)
				.last()
				.click();
			assert.equal(
				await stable(target, `${name}-last-page`),
				maximized,
				`${name}: short last page cannot shrink page capacity`
			);
			assert.ok(
				(await state(target)).rows < maximized,
				`${name}: fixture exercises a short last page`
			);
		}
		if (
			target === targets[0] &&
			count > 50 &&
			viewport.height === 1050 &&
			!process.argv.includes('--baseline')
		) {
			const filterInput = page.locator(`#${target.id} thead input`).first();
			for (const [value, expectedRows] of [
				['NO-SYNTHETIC-MATCH', 0],
				['SYNTHETIC-H100', 1],
				['THREE', 3]
			]) {
				await filterInput.fill(value);
				await filterInput.press('Tab');
				await page.waitForTimeout(300); // Allow the real keyup search debounce to complete before idle sampling.
				await stable(target, `${name}-filter-${expectedRows}-rows`);
				assert.equal(
					(await state(target)).rows,
					expectedRows,
					`${name}: real column search gives ${expectedRows} rows`
				);
				await filterInput.fill('');
				await filterInput.press('Tab');
				await page.waitForTimeout(300);
				assert.equal(
					await stable(target, `${name}-filter-${expectedRows}-restored`),
					maximized,
					`${name}: clearing column search restores full page capacity`
				);
			}
		}
		assert.equal(errors.length, errorStart, errors.slice(errorStart).join('\n'));
		// Full-page captures can enlarge the emulated screen and change the app's mobile breakpoint.
		await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: !mobile });
	} catch (error) {
		cases.push({ name, failed: true, error: error.stack });
		await page.screenshot({ path: path.join(out, `${name}-failed.png`), fullPage: !mobile });
		throw error;
	}
}
let failure;
try {
	const baseline = process.argv.includes('--baseline');
	if (mobile) {
		await run(targets[0], { width: 1280, height: 700 }, 101);
		assert.equal(
			await page.evaluate(() => document.documentElement.dataset.ovisMobileLayout),
			'landscape',
			'Mobile fixture activates the real landscape layout'
		);
	} else
		for (const target of baseline ? targets.slice(0, 1) : targets) {
			await run(target, { width: 1900, height: 1050 }, 101);
			if (!baseline) await run(target, { width: 1900, height: 760 }, 101);
		}
	if (!baseline && !mobile)
		for (const count of [0, 1, 3]) await run(targets[0], { width: 1900, height: 1050 }, count);
	assert.deepEqual(
		errors,
		[],
		'No unrelated page errors or dialogs may mask the regression result'
	);
} catch (error) {
	failure = error;
} finally {
	fs.writeFileSync(
		path.join(out, 'report.json'),
		JSON.stringify({ base, synthetic: true, passed: !failure, cases, errors, requests }, null, 2)
	);
	await browser.close();
}
if (failure) throw failure;
