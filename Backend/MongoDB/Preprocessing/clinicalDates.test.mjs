import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { sanitizeDate, calculateAgeAtDiagnosis } from './clinicalDates.mjs';

test('invalid or missing dates cannot create epoch-relative diagnosis ages', () => {
	for (const unknown of [undefined, null, '', ' ', '-', 'not-a-date', '00.00.0000', '1899-12-31']) {
		assert.equal(sanitizeDate(unknown), null, String(unknown));
		assert.equal(calculateAgeAtDiagnosis(unknown, '1980-01-01'), null, String(unknown));
		assert.equal(calculateAgeAtDiagnosis('2024-01-01', unknown), null, String(unknown));
	}
});

test('impossible ISO and German calendar dates remain unknown instead of rolling forward', () => {
	for (const invalid of [
		'2023-02-29',
		'2023-02-29T12:00:00Z',
		'2024-04-31',
		'2024-13-01',
		'2024-00-01',
		'2024-01-00',
		'29.02.2023',
		'31.04.2024'
	]) {
		assert.equal(sanitizeDate(invalid), null, invalid);
		assert.equal(calculateAgeAtDiagnosis(invalid, '1980-01-01'), null, invalid);
	}
	assert.equal(sanitizeDate('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
	assert.equal(sanitizeDate('29.02.2024').toISOString(), '2024-02-29T00:00:00.000Z');
});

test('valid existing input formats and timezone offsets keep their parsed instants', () => {
	const date = new Date('2024-03-31T00:00:00Z');
	assert.equal(sanitizeDate(date), date);
	assert.equal(sanitizeDate(date.getTime()).getTime(), date.getTime());
	assert.equal(sanitizeDate('2024-03-31T02:30:00+02:00').toISOString(), '2024-03-31T00:30:00.000Z');
	assert.equal(sanitizeDate('01.03.2024').toISOString(), '2024-03-01T00:00:00.000Z');
	assert.equal(sanitizeDate('1.3.2024').toISOString(), '2024-03-01T00:00:00.000Z');
	assert.equal(sanitizeDate('March 1, 2024').getTime(), new Date('March 1, 2024').getTime());
	assert.equal(sanitizeDate(new Date(Number.NaN)), null);
});

test('valid ages keep the existing rounding, zero and reversed-date behavior', () => {
	assert.equal(calculateAgeAtDiagnosis('2024-01-01', '1980-01-01'), 44);
	assert.equal(calculateAgeAtDiagnosis('2020-07-02', '2000-01-01'), 21);
	assert.equal(calculateAgeAtDiagnosis('2000-01-01', '2000-01-01'), 0);
	assert.equal(calculateAgeAtDiagnosis('2000-01-01', '2024-01-01'), 24);
});

test('German calendar dates and age rounding agree across UTC and Europe/Berlin', () => {
	const moduleUrl = new URL('./clinicalDates.mjs', import.meta.url).href;
	const program = `
		import { sanitizeDate, calculateAgeAtDiagnosis } from ${JSON.stringify(moduleUrl)};
		const dates = ['29.02.2024', '1.2.2024', '01.2.2024', '1.02.2024', '1.7.2024',
			'2024-02-01T00:30:00+01:00', '2024-07-01T00:30:00+02:00'];
		console.log(JSON.stringify({ dates: dates.map(value => sanitizeDate(value).toISOString()),
			ages: [calculateAgeAtDiagnosis('1.2.2024', '2024-02-01'),
				calculateAgeAtDiagnosis('2.7.2020', '2000-01-01')] }));
	`;
	const expected = {
		dates: [
			'2024-02-29T00:00:00.000Z',
			'2024-02-01T00:00:00.000Z',
			'2024-02-01T00:00:00.000Z',
			'2024-02-01T00:00:00.000Z',
			'2024-07-01T00:00:00.000Z',
			'2024-01-31T23:30:00.000Z',
			'2024-06-30T22:30:00.000Z'
		],
		ages: [0, 21]
	};
	for (const TZ of ['UTC', 'Europe/Berlin']) {
		const result = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
			env: { ...process.env, TZ },
			encoding: 'utf8'
		});
		assert.deepEqual(JSON.parse(result), expected, TZ);
	}
});

test('year-1900 cutoff and legacy unpadded calendar inputs are independent of server timezone', () => {
	const moduleUrl = new URL('./clinicalDates.mjs', import.meta.url).href;
	const program = `
		import {sanitizeDate} from ${JSON.stringify(moduleUrl)};
		const values = ['1900-01-01', '1.1.1900', '1900-1-1', '1900-7-1', '1.7.1900',
			'2024-2-1', '2024-7-1', '1899-12-31T23:59:59.999Z', '1900-01-01T00:00:00.000Z',
			'1900-01-01T01:00:00.000+01:00', '1900-01-01T00:00:00.000+01:00'];
		console.log(JSON.stringify(values.map(value => sanitizeDate(value)?.toISOString() ?? null)));
	`;
	for (const TZ of ['UTC', 'Europe/Berlin', 'America/New_York']) {
		const result = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
			env: { ...process.env, TZ },
			encoding: 'utf8'
		});
		assert.deepEqual(
			JSON.parse(result),
			[
				'1900-01-01T00:00:00.000Z',
				'1900-01-01T00:00:00.000Z',
				'1900-01-01T00:00:00.000Z',
				'1900-07-01T00:00:00.000Z',
				'1900-07-01T00:00:00.000Z',
				'2024-02-01T00:00:00.000Z',
				'2024-07-01T00:00:00.000Z',
				null,
				'1900-01-01T00:00:00.000Z',
				'1900-01-01T00:00:00.000Z',
				null
			],
			TZ
		);
	}
});
