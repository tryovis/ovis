import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { formatDateForInput, parseDateInput } from './filterDateInput.js';

const require = createRequire(import.meta.url);
const { internal } = require('../../../Backend/Apollo/astTranslator.js');

const dates = [
	'2014-01-01',
	'2024-12-31',
	'2024-07-15',
	'2024-03-31', // Berlin changes to summer time.
	'2024-10-27', // Berlin changes to winter time.
	'2024-03-10', // New York changes to summer time.
	'2024-11-03', // New York changes to winter time.
	'2024-02-29'
];

// These synchronous tests must not run concurrently: Date uses process-wide TZ.
function inTimezone(timezone, callback) {
	const previous = process.env.TZ;
	process.env.TZ = timezone;
	try {
		callback();
	} finally {
		if (previous === undefined) delete process.env.TZ;
		else process.env.TZ = previous;
	}
}

for (const timezone of ['Europe/Berlin', 'UTC', 'America/New_York']) {
	test(`date inputs preserve local calendar days and midnight in ${timezone}`, () => {
		inTimezone(timezone, () => {
			for (const value of [...dates, '0001-01-01', '0099-12-31']) {
				const [year, month, day] = value.split('-').map(Number);
				const timestamp = parseDateInput(value);
				assert.equal(typeof timestamp, 'number', value);
				assert.ok(Number.isFinite(timestamp), value);
				const date = new Date(timestamp);
				assert.deepEqual(
					[
						date.getFullYear(),
						date.getMonth() + 1,
						date.getDate(),
						date.getHours(),
						date.getMinutes(),
						date.getSeconds(),
						date.getMilliseconds()
					],
					[year, month, day, 0, 0, 0, 0],
					value
				);
				assert.equal(formatDateForInput(timestamp), value);
				assert.equal(formatDateForInput(String(timestamp)), value);

				let editedTimestamp = timestamp;
				for (let edit = 0; edit < 5; edit += 1) {
					editedTimestamp = parseDateInput(formatDateForInput(editedTimestamp));
					assert.equal(editedTimestamp, timestamp, `${value}, edit ${edit + 1}`);
				}
			}
		});
	});
}

test('opening the screenshot range in Berlin does not subtract a day', () => {
	inTimezone('Europe/Berlin', () => {
		const selectedStart = Date.parse('2013-12-31T23:00:00.000Z');
		const selectedEnd = Date.parse('2024-12-30T23:00:00.000Z');
		assert.equal(formatDateForInput(selectedStart), '2014-01-01');
		assert.equal(formatDateForInput(selectedEnd), '2024-12-31');
		assert.equal(parseDateInput('2014-01-01'), selectedStart);
		assert.equal(parseDateInput('2024-12-31'), selectedEnd);
	});
});

for (const timezone of ['Europe/Berlin', 'UTC']) {
	test(`backend keeps both inclusive date bounds on the selected day in ${timezone}`, () => {
		inTimezone(timezone, () => {
			for (const value of dates) {
				const timestamp = parseDateInput(value);
				const query = internal.localQuery(
					{
						system: 'diagnosis',
						key: 'diagnosisDate',
						type: 'BETWEEN',
						value: { min: timestamp, max: timestamp }
					},
					'diagnosis'
				);
				const range = query.diagnosisDate;
				const selectedDay = Date.parse(`${value}T00:00:00.000Z`);
				assert.equal(range.$gte.getTime(), selectedDay, `${value} minimum`);
				assert.equal(range.$lte.getTime(), selectedDay, `${value} maximum`);
				assert.ok(selectedDay >= range.$gte && selectedDay <= range.$lte);
				assert.ok(selectedDay + 86400000 > range.$lte, 'next day must be excluded');
			}
		});
	});
}

test('empty or invalid timestamp values do not become dates', () => {
	for (const value of [null, undefined, '', ' ', 'not a timestamp', NaN, Infinity, -Infinity]) {
		assert.equal(formatDateForInput(value), '', String(value));
	}
	inTimezone('UTC', () => {
		assert.equal(formatDateForInput(0), '1970-01-01');
		assert.equal(formatDateForInput('0'), '1970-01-01');
	});
});

test('empty, malformed and impossible native date inputs are rejected', () => {
	for (const value of [
		null,
		undefined,
		'',
		' ',
		0,
		NaN,
		false,
		{},
		[],
		'2024-1-01',
		'2024-01-1',
		'01.01.2024',
		'2024-01-01T00:00:00Z',
		'2024-02-30',
		'2023-02-29',
		'1900-02-29',
		'2024-04-31',
		'2024-00-01',
		'2024-13-01',
		'2024-01-00',
		'2024-01-32',
		'0000-01-01'
	]) {
		assert.equal(parseDateInput(value), null, String(value));
	}
	assert.equal(formatDateForInput(parseDateInput('2000-02-29')), '2000-02-29');
});
