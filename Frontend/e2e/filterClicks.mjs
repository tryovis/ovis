import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OVIS_PLAYWRIGHT_MODULE ||
  'playwright');
const { parse, valueFromASTUntyped } = require(process.env
  .OVIS_GRAPHQL_MODULE || 'graphql');
const base = process.env.OVIS_TEST_URL || 'http://127.0.0.1:5179';
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname),
  'Only a local isolated app is supported'
);
const out = path.resolve(
  process.env.OVIS_TEST_OUTPUT || 'filter-click-results'
);
fs.mkdirSync(out, { recursive: true });
const restricted = !process.argv.includes('--unrestricted');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.OVIS_CHROMIUM
    ? { executablePath: process.env.OVIS_CHROMIUM }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1900, height: 1050 },
  timezoneId: 'Europe/Berlin',
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
              value: 'C30-C39',
            },
          ],
        },
      ],
    },
  ],
};
const stored = {
  currentUser: 'synthetic-browser-user',
  currentRole: 'user',
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
    timestamp: Date.now(),
  },
};
await page.addInitScript(
  (value) => localStorage.setItem('loggedInUser', JSON.stringify(value)),
  stored
);
const field = (system, key, values, fieldType = 'single-select') => ({
  key,
  name: key,
  system,
  type: key.startsWith('!')
    ? 'NEQUALS'
    : fieldType === 'number' || fieldType === 'date'
    ? 'BETWEEN'
    : 'EQUALS',
  fieldType,
  criteria: (restricted ? [] : values).map((value) => ({
    key: value,
    name: String(value),
  })),
});
const fields = {
  patient: {
    gender: ['m', 'w', 'd'],
    vitalState: ['alive', 'dead'],
    state: ['Bayern'],
    country: ['Deutschland'],
    county: ['Muenchen'],
    postalCode: ['80000'],
    patID: ['SYNTHETIC-1', 'SYNTHETIC-2'],
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
    oz_lung: ['true'],
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
    MGroup: ['0', '1'],
  },
  molecularMarker: { type: ['EGFR'], status: ['positiv', 'negativ'] },
  therapy: { type: ['OP', 'ST'], intention: ['K', 'P'] },
  study: { shortname: ['SYNTH-A', 'SYNTH-B'] },
};
const catalogue = Object.entries(fields).map(([system, items]) => ({
  key: system,
  name: system,
  childCategories: Object.entries(items).flatMap(([key, values]) => [
    field(system, key, values),
    field(system, '!' + key, values),
  ]),
}));
catalogue
  .find((c) => c.key === 'diagnosis')
  .childCategories.push(
    field('diagnosis', 'diagnosisDate', [], 'date'),
    field('diagnosis', 'ageAtDiagnosis', [], 'number')
  );
catalogue
  .find((c) => c.key === 'patient')
  .childCategories.push(field('patient', 'birthDate', [], 'date'));
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
  diagnosticOccurrenceDate: Date.UTC(2026, 0, 1),
}));
function respond(name, v = {}) {
  if (name === 'getPlatformConfiguration')
    return {
      colorTheme: 'CCCMunich',
      colorPalette: stored.colorPalette,
      systemLanguage: 'en',
      source: 'TEST',
      documents: [],
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
        userFilter: [stored.currentFilter],
        filter: stored.currentFilter,
      },
    ];
  if (name === 'getLastMetaData') return { executedAt: Date.now() };
  if (name.startsWith('update') || name === 'recordUsageEvents')
    return { acknowledged: true };
  if (name === 'getQuicktoolsBasicsIcd10')
    return ['C30-C39 → Respiratory', 'C34 → Lung', 'C32 → Larynx'];
  if (name === 'getQuicktoolsBasicsHistology')
    return ['8140/3 → Synthetic adenocarcinoma', '8070/3 → Synthetic'];
  if (name === 'getQuicktoolsCountOverview')
    return ['patient', 'diagnosis', 'therapy', 'progress'].map(
      (collection) => ({ collection, count: 18 })
    );
  if (name === 'getPatientCohortGenderChart')
    return { label: ['m', 'w', 'd'], count: [6, 7, 5] };
  if (name === 'getPatientCohortDeathChart')
    return { label: ['alive', 'dead'], count: [10, 8] };
  if (name === 'getPatientCohortAgeChart')
    return [
      { ageAtDiagnosis: 60, count: 6 },
      { ageAtDiagnosis: 65, count: 7 },
      { ageAtDiagnosis: 70, count: 5 },
    ];
  if (name === 'getPatientCohortMapChart')
    return [
      { label: 'Deutschland', description: 'Deutschland', count: 18 },
      { label: 'Bayern', description: 'Bayern', count: 18 },
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
        count: g.abscissa === 'none' ? [i ? 6 : 12] : [4, 5, 3],
      })),
    };
  }
  if (name === 'getTnmCount')
    return [
      { T: '2', N: '1', M: '0', count: 8 },
      { T: '3', N: '0', M: '0', count: 10 },
    ];
  if (name === 'getTnmMetastases')
    return records
      .slice(0, 6)
      .map((r) => ({
        ...r,
        T: '2',
        N: '1',
        M: '0',
        type: 'p',
        version: '8',
        tnmOccurrenceDate: Date.UTC(2026, 0, 1),
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
      count: [10, 8],
    };
  if (name === 'getMolecularMarkerChart')
    return {
      category: ['EGFR'],
      groups: [
        { label: 'positiv', count: [3] },
        { label: 'negativ', count: [2] },
      ],
    };
  if (name === 'getStudyPatientChart')
    return [
      { shortname: 'SYNTH-A', studyPatients: 10 },
      { shortname: 'SYNTH-B', studyPatients: 8 },
    ];
  if (name === 'getValueOptions') return fields[v.collection]?.[v.field] ?? [];
  if (/Table|AllPatient/.test(name))
    return records.slice(v.offset ?? 0, (v.offset ?? 0) + (v.limit ?? 6));
  return [];
}
function completeSelection(value, selection) {
  if (Array.isArray(value))
    return value.map((item) => completeSelection(item, selection));
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
      json: {
        active: true,
        preferred_username: stored.currentUser,
        ...stored.keycloakTokens,
      },
    });
  if (url.pathname === '/api/catalogue')
    return route.fulfill({
      json: {
        data: catalogue,
        revision: 'synthetic-1',
        source: 'synthetic fixture',
        timestamp: Date.now(),
        size: 10000,
      },
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
                valueFromASTUntyped(a.value, body.variables),
              ])
            ),
          };
          data[f.alias?.value ?? name] = completeSelection(
            respond(name, variables),
            f.selectionSet
          );
          requests.push({ name, variables });
        }
    return route.fulfill({ json: { data } });
  }
  return route.continue();
});
const snapshot = async () => {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('lens-data-passer')].some(
        (e) =>
          typeof e.getQueryAPI === 'function' && Array.isArray(e.getQueryAPI())
      ),
    null,
    { timeout: 8000 }
  );
  return page.evaluate(() => {
    const lens = [...document.querySelectorAll('lens-data-passer')].find(
      (e) =>
        typeof e.getQueryAPI === 'function' && Array.isArray(e.getQueryAPI())
    );
    return { query: lens.getQueryAPI(), ast: lens.getAstAPI() };
  });
};
const rows = async () => ((await snapshot()).query ?? []).flat();
async function expectRow(key, system, values) {
  await page.waitForFunction(
    ({ key, system, values }) => {
      const lens = [...document.querySelectorAll('lens-data-passer')].find(
        (e) => typeof e.getQueryAPI === 'function'
      );
      const row = lens
        ?.getQueryAPI()
        ?.flat()
        .find((r) => r.key === key && r.system === system);
      return (
        !!row &&
        values.every((v) =>
          row.values.some((x) => JSON.stringify(x.value) === JSON.stringify(v))
        )
      );
    },
    { key, system, values },
    { timeout: 5000 }
  );
  return (await rows()).find((r) => r.key === key && r.system === system);
}
async function reset() {
  await page.locator('.filter-history-controls button').last().click();
  await page.waitForTimeout(250);
  assert.equal((await rows()).filter((r) => r.key !== 'isTumor').length, 0);
}
async function run(name, fn) {
  const before = errors.length;
  try {
    await fn();
    await page.waitForTimeout(250);
    assert.equal(errors.length, before, errors.slice(before).join('\n'));
    cases.push({ name, status: 'passed', state: await snapshot() });
    console.log('PASS', name);
  } catch (e) {
    cases.push({
      name,
      status: 'failed',
      error: e.stack,
      state: await snapshot(),
    });
    console.log('FAIL', name, e.message);
    console.log(
      'TABLES',
      await page
        .locator('table')
        .evaluateAll((items) =>
          items.map((t) => ({ id: t.id, text: t.innerText.slice(0, 150) }))
        )
    );
    await page.screenshot({
      path: path.join(out, name + '.png'),
      fullPage: true,
    });
    throw e;
  }
  await page.screenshot({
    path: path.join(out, name + '.png'),
    fullPage: true,
  });
}
async function chartClick(label, dataset = 0) {
  await page.waitForTimeout(1300);
  const point = await page.evaluate(
    async ({ label, dataset }) => {
      const urls = performance.getEntriesByType('resource').map((e) => e.name);
      const moduleURL = urls.find((n) =>
        /chart__js\.js|chart_js\.js|chart\.js\/dist\/chart\.js/.test(n)
      );
      if (!moduleURL)
        throw Error(
          'Chart module missing: ' +
            urls.filter((n) => n.includes('chart')).join(',')
        );
      const { Chart } = await import(moduleURL);
      for (const canvas of document.querySelectorAll('canvas')) {
        const chart = Chart.getChart(canvas);
        if (!chart) continue;
        const index = (
          chart.data.labels?.length
            ? chart.data.labels
            : chart.data.datasets[dataset]?.data.map((p) => p.x) ?? []
        ).findIndex((l) => String(l) === label);
        if (index < 0) continue;
        const box = canvas.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const pos = chart.getDatasetMeta(dataset).data[index].getCenterPoint();
        return { x: box.left + pos.x, y: box.top + pos.y };
      }
      throw Error('No visible chart label ' + label);
    },
    { label, dataset }
  );
  await page.mouse.click(point.x, point.y);
}
async function svgClick(selector) {
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible', timeout: 60000 });
  const point = await element.evaluate((node) => {
    const box = node.getBBox(),
      matrix = node.getScreenCTM();
    for (const fx of [0.25, 0.75, 0.5, 0.15, 0.85])
      for (const fy of [0.5, 0.35, 0.65, 0.25, 0.75]) {
        const local = new DOMPoint(
          box.x + box.width * fx,
          box.y + box.height * fy
        );
        if (!node.isPointInFill(local)) continue;
        const p = local.matrixTransform(matrix);
        if (node.getRootNode().elementFromPoint(p.x, p.y) === node)
          return { x: p.x, y: p.y };
      }
    throw Error('No painted clickable point found for ' + node.id);
  });
  await page.mouse.click(point.x, point.y);
}
async function navigate(route) {
  await Promise.all([
    page.waitForURL('**' + route, { timeout: 60000 }),
    page
      .locator('a[href="' + route + '"],a[href="' + route.slice(1) + '"]')
      .first()
      .click(),
  ]);
  await page
    .locator(
      {
        '/diagnosis': '.diagnosis-bar-control-panel canvas',
        '/filter-edit': 'input[list="keyOptions"]',
        '/tnm': '#generic_tnmTable tbody td',
        '/study': '.study-patient-chart-root canvas',
        '/molecular-marker': '#molecularMarkerChart',
      }[route] || '.query-output'
    )
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(300);
}
try {
  await page.goto(base + '/patient-cohort', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('canvas', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1200);
  if (await page.getByRole('button', { name: 'Accept', exact: true }).count())
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await run('01-startup', async () => {
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('canvas').count(), 3);
    assert.equal((await rows()).filter((r) => r.key !== 'isTumor').length, 0);
  });
  await run('02-gender-canvas', async () => {
    await chartClick('m');
    await expectRow('gender', 'patient', ['m']);
    await chartClick('w');
    await expectRow('gender', 'patient', ['m', 'w']);
  });
  await run('03-gender-quickselect-or', async () => {
    await page.locator('.gender-button-control').nth(1).click();
    await expectRow('gender', 'patient', ['m', 'w']);
  });
  await run('04-remove-one-value-undo-redo', async () => {
    await page
      .locator('.query-output .value-item')
      .filter({ hasText: /^m\s*$/ })
      .click();
    let r = await expectRow('gender', 'patient', ['w']);
    assert.equal(r.values.length, 1);
    await page.locator('.filter-history-controls button').nth(0).click();
    await expectRow('gender', 'patient', ['m', 'w']);
    await page.locator('.filter-history-controls button').nth(1).click();
    r = await expectRow('gender', 'patient', ['w']);
    assert.equal(r.values.length, 1);
  });
  await run('05a-vital-status-canvas', async () => {
    await chartClick('alive');
    await expectRow('vitalState', 'patient', ['alive']);
    await expectRow('gender', 'patient', ['w']);
  });
  await run('05-reset', reset);
  await run('06-age-canvas', async () => {
    await chartClick('w');
    await chartClick('60');
    await expectRow('gender', 'patient', ['w']);
    await expectRow('ageAtDiagnosis', 'diagnosis', [{ min: 60, max: 60 }]);
  });
  await reset();
  await navigate('/diagnosis');
  await run('07-lung-svg-click', async () => {
    await svgClick('.bodymap #C34');
    await expectRow('ICD_ICD10_3', 'diagnosis', ['C34']);
    assert.equal(
      (await rows()).some((r) => r.key === 'ICD_ICD10Group'),
      false
    );
  });
  await run('08-diagnosis-year-preserves-lung', async () => {
    await chartClick('2026');
    await expectRow('ICD_ICD10_3', 'diagnosis', ['C34']);
    await expectRow('diagnosisDate', 'diagnosis', [
      { min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 11, 31) },
    ]);
    assert.equal(
      (await rows()).some((r) => r.key === 'ICD_ICD10Group'),
      !restricted
    );
  });
  await run('09-quickselect-larynx-or', async () => {
    await page
      .locator('#diagnoseDropdown')
      .selectOption({ label: 'C32 → Larynx' });
    await expectRow('ICD_ICD10_3', 'diagnosis', ['C34', 'C32']);
  });
  await run('10-histology-combination', async () => {
    await page
      .locator('#histologieDropdown')
      .selectOption({ label: '8140/3 → Synthetic adenocarcinoma' });
    await expectRow('ICDO_histologyCode', 'histology', ['8140/3']);
    await expectRow('diagnosisDate', 'diagnosis', [
      { min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 11, 31) },
    ]);
  });
  await run('11-remove-date-row', async () => {
    await page
      .locator('.query-output .label-item')
      .filter({ hasText: 'diagnosis' })
      .click();
    assert.equal(
      (await rows()).some((r) => r.key === 'diagnosisDate'),
      false
    );
    await expectRow('ICD_ICD10_3', 'diagnosis', ['C34', 'C32']);
  });
  await run('12-date-dialog', async () => {
    await page
      .locator('#optionDropdown')
      .selectOption({ label: 'Diagnosis date' });
    await page.locator('.disclaimer .operator-select').selectOption('[]');
    const upper = page.locator('.disclaimer .upperRow select'),
      lower = page.locator('.disclaimer .lowerRow select');
    await upper.nth(2).selectOption('2025');
    await upper.nth(1).selectOption('01');
    await upper.nth(0).selectOption('01');
    await lower.nth(2).selectOption('2025');
    await lower.nth(1).selectOption('12');
    await lower.nth(0).selectOption('31');
    await page.locator('.disclaimer .confirm-button').click();
    const r = await expectRow('diagnosisDate', 'diagnosis', []);
    assert.equal(r.type, 'BETWEEN');
    assert.equal(r.values[0].value.max - r.values[0].value.min, 364 * 86400000);
  });
  await run('13-remove-and-reset-combination', async () => {
    await page
      .locator('.query-output .value-item')
      .filter({ hasText: 'C34' })
      .click();
    await expectRow('ICD_ICD10_3', 'diagnosis', ['C32']);
    await reset();
  });
  await run('14-editor-outer-or-save', async () => {
    await navigate('/filter-edit');
    const keys = page.locator('input[list="keyOptions"]');
    await keys.first().fill('ICD_ICD10_3(diagnosis)');
    await keys.first().press('Tab');
    await page.locator('input[list^="valueOptions-"][list$="-ICD_ICD10_3"]').fill('C34');
    await page
      .locator('button')
      .filter({ hasText: 'Neue Gruppe hinzufügen (OR)' })
      .click();
    await keys.last().fill('gender(patient)');
    await keys.last().press('Tab');
    await page.locator('input[list^="valueOptions-"][list$="-gender"]').fill('w');
    await page
      .locator('button')
      .filter({ has: page.locator('img[alt="save"]') })
      .click();
    await page.waitForURL('**/diagnosis', { timeout: 60000 });
    await page
      .locator('.query-output')
      .waitFor({ state: 'visible', timeout: 60000 });
    const state = await snapshot();
    assert.equal(state.query.length, 2);
    await expectRow('ICD_ICD10_3', 'diagnosis', ['C34']);
    await expectRow('gender', 'patient', ['w']);
  });
  await run('15-or-preserved-on-chart-click', async () => {
    await chartClick('2025');
    await expectRow('diagnosisDate', 'diagnosis', [
      { min: Date.UTC(2025, 0, 1), max: Date.UTC(2025, 11, 31) },
    ]);
    const q = (await snapshot()).query;
    assert.equal(q.length, 2);
    assert.equal(q[1].length, 1);
    assert.equal(q[1][0].key, 'gender');
    assert.equal(q[1][0].values[0].value, 'w');
  });
  await reset();
  await page.goto(base + '/patient-cohort', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await run('16-table-category-click', async () => {
    await page
      .getByRole('button', { name: 'Diagnosis history', exact: true })
      .click();
    await page
      .locator('#generic_patientCohortHistoryTable tbody td')
      .filter({ hasText: /^C34\.1$/ })
      .first()
      .click();
    await expectRow('ICD_ICD10', 'diagnosis', ['C34.1']);
  });
  await run('17-number-dialog-with-category', async () => {
    await page
      .locator('#generic_patientCohortHistoryTable tbody td')
      .filter({ hasText: /^60$/ })
      .first()
      .click();
    await page.locator('#lowerValue').fill('60');
    await page.locator('#upperValue').fill('65');
    await page.locator('.disclaimer .confirm-button').click();
    await expectRow('ageAtDiagnosis', 'diagnosis', [{ min: 60, max: 65 }]);
    await expectRow('ICD_ICD10', 'diagnosis', ['C34.1']);
  });
  await reset();
  await navigate('/tnm');
  await run('18-tnm-dialog-exact', async () => {
    await page
      .locator('#generic_tnmTable tbody td')
      .filter({ hasText: /^2$/ })
      .first()
      .click();
    await page.locator('.disclaimer .confirm-button').first().click();
    await expectRow('T', 'tnm', ['2']);
  });
  await run('19-tnm-dialog-grouped', async () => {
    await page
      .locator('#generic_tnmTable tbody td')
      .filter({ hasText: /^2$/ })
      .first()
      .click();
    await page.locator('.disclaimer .confirm-button').nth(1).click();
    await expectRow('TGroup', 'tnm', ['2']);
    await expectRow('T', 'tnm', ['2']);
  });
  await run('20-generic-category-canvas', async () => {
    await page.locator('.tnm-pie-chart select').selectOption('type');
    await chartClick('p');
    await expectRow('type', 'tnm', ['p']);
  });
  await reset();
  await navigate('/study');
  await run('21-study-canvas', async () => {
    await chartClick('SYNTH-A');
    await expectRow('shortname', 'study', ['SYNTH-A']);
  });
  await run('22-filter-toggle-preserves-scope', async () => {
    const before = requests.length;
    await page.locator('.filter-toggle-button').click();
    await page.waitForFunction(() =>
      document
        .querySelector('.filter-toggle-button')
        ?.textContent.includes('inactive')
    );
    await page.waitForTimeout(400);
    const request = requests
      .slice(before)
      .filter((r) => r.name === 'getStudyPatientChart')
      .at(-1);
    assert.ok(request);
    assert.ok(!request.variables.filter.includes('SYNTH-A'));
    if (restricted) assert.ok(request.variables.filter.includes('C30-C39'));
    await page.locator('.filter-toggle-button').click();
    await expectRow('shortname', 'study', ['SYNTH-A']);
  });
  await reset();
  await navigate('/molecular-marker');
  await run('23-stacked-category-status-canvas', async () => {
    await chartClick('EGFR', 0);
    await expectRow('type', 'molecularMarker', ['EGFR']);
    await expectRow('status', 'molecularMarker', ['positiv']);
  });
  await run('24-final-reset-scope', async () => {
    await reset();
    if (restricted) {
      const scoped = requests.filter(
        (r) =>
          typeof r.variables?.filter === 'string' &&
          r.name !== 'getValueOptions'
      );
      assert.ok(scoped.length > 10);
      assert.ok(
        scoped.every((r) => r.variables.filter.includes('C30-C39')),
        'Every filtered data request preserves mandatory scope'
      );
    }
  });
  assert.deepEqual(errors, [], 'No browser errors, including between cases');
  console.log(
    'FINAL',
    JSON.stringify(
      { cases: cases.map(({ name, status }) => ({ name, status })), errors },
      null,
      2
    )
  );
} finally {
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify({ restricted, cases, errors, requests }, null, 2)
  );
  await browser.close();
}
