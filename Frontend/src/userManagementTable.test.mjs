import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const userManagementTable = await readFile(
	new URL('./routes/user-management/UserManagementTable.svelte', import.meta.url),
	'utf8'
);
const tableBuilder = await readFile(new URL('./tableBuilder.ts', import.meta.url), 'utf8');

test('user management shows every user without pagination', () => {
	assert.match(userManagementTable, /const tableShownRows = -1;/);
	assert.match(tableBuilder, /paging: rowCount !== -1,/);
});
