import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStudyChartRows, createStudyShortnameQueryItem } from './studyPatientChartModel.js';

test('keeps the exact study value while shortening only its display label', () => {
	const longName = 'Extremely long molecular oncology study name';
	const [row] = buildStudyChartRows([{ shortname: longName, studyPatients: ['P1', 'P2'] }]);
	const queryItem = createStudyShortnameQueryItem(row);

	assert.equal(row.displayShortname, 'Extremely long m[...]');
	assert.equal(row.shortname, longName);
	assert.equal(queryItem.type, 'EQUALS');
	assert.equal(queryItem.values[0].value, longName);
});

test('normalizes empty and numeric participant counts and sorts deterministically', () => {
	const rows = buildStudyChartRows([
		{ shortname: 'Three', studyPatients: 3 },
		{ shortname: 'Empty B', studyPatients: null },
		{ shortname: 'Empty A', studyPatients: [] },
		{ shortname: 'Two', studyPatients: ['P1', 'P2'] },
		null
	]);

	assert.deepEqual(
		rows.map(({ shortname, studyPatients }) => [shortname, studyPatients]),
		[
			['Empty A', 0],
			['Empty B', 0],
			['Two', 2],
			['Three', 3]
		]
	);
});
