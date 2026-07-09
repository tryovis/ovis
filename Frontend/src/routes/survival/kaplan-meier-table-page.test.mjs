import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = '/tmp/ovis-kaplan-meier-table-page-test.mjs';

await build({
	entryPoints: ['Frontend/src/routes/survival/kaplan-meier-table-page.ts'],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});

const { buildKaplanMeierTableData, fetchKaplanMeierTablePage } = await import(
	pathToFileURL(outfile).href
);

const columns = [
	{ data: 'tumorID' },
	{ data: 'time' },
	{ data: 'event' },
	{ data: 'nevent' },
	{ data: 'ncensor' },
	{ data: 'n' },
	{ data: 'surv' },
	{ data: 'upper' },
	{ data: 'lower' },
	{ data: 'group' }
];

function sourceRow(index, overrides = {}) {
	return {
		tumorID: `T-${index}`,
		time: index * 30.44,
		event: index % 2,
		nevent: index,
		ncensor: index % 3,
		n: 100 - index,
		surv: 0.98765,
		upper: 1,
		lower: 0.91234,
		group: index % 2 === 0 ? 'A' : 'B',
		...overrides
	};
}

test('fetchKaplanMeierTablePage returns a DataTables-sized page from the full KM row set', () => {
	const sourceRows = Array.from({ length: 120 }, (_, index) => sourceRow(index));
	const { rows } = buildKaplanMeierTableData(sourceRows, {
		selectedTimeType: 'Monat',
		selectedConfidenceType: '95% Konf.-Intervall',
		columns,
		eventLabel: 'event'
	});

	const page = fetchKaplanMeierTablePage(rows, {
		offset: 20,
		limit: 19,
		sortField: 'time',
		sortDirection: 'asc',
		columnFilters: []
	});

	assert.equal(page.total, 120);
	assert.equal(page.filtered, 120);
	assert.equal(page.rows.length, 19);
	assert.deepEqual(
		page.rows.map((row) => row.tumorID),
		Array.from({ length: 19 }, (_, index) => `T-${index + 20}`)
	);
});

test('fetchKaplanMeierTablePage applies column filters before slicing', () => {
	const sourceRows = [
		sourceRow(1, { group: 'Female', tumorID: 'T-A' }),
		sourceRow(2, { group: 'Male', tumorID: 'T-B' }),
		sourceRow(3, { group: 'Female', tumorID: 'T-C' })
	];
	const { rows, reorderedRows } = buildKaplanMeierTableData(sourceRows, {
		selectedTimeType: 'Tag',
		selectedConfidenceType: 'Kein Konf.-Intervall',
		columns,
		eventLabel: 'event'
	});

	const page = fetchKaplanMeierTablePage(rows, {
		offset: 0,
		limit: 10,
		sortField: 'tumorID',
		sortDirection: 'desc',
		columnFilters: [{ field: 'group', value: 'Female' }]
	});

	assert.equal(page.total, 3);
	assert.equal(page.filtered, 2);
	assert.deepEqual(
		page.rows.map((row) => row.tumorID),
		['T-C', 'T-A']
	);
	assert.deepEqual(
		Object.keys(reorderedRows[0]),
		columns.map((column) => column.data)
	);
	assert.equal(rows[0].upper, '');
	assert.equal(rows[0].lower, '');
});
