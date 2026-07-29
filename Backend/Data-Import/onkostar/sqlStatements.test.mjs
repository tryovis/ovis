import assert from 'node:assert/strict';
import test from 'node:test';

async function importStatements(patientMasters, cacheKey) {
	const previousValue = process.env.ONKOSTAR_PATIENTENSTAEMME;

	if (patientMasters === undefined) {
		delete process.env.ONKOSTAR_PATIENTENSTAEMME;
	} else {
		process.env.ONKOSTAR_PATIENTENSTAEMME = patientMasters;
	}

	try {
		return await import(`./sqlStatements.mjs?${cacheKey}=${Date.now()}`);
	} finally {
		if (previousValue === undefined) {
			delete process.env.ONKOSTAR_PATIENTENSTAEMME;
		} else {
			process.env.ONKOSTAR_PATIENTENSTAEMME = previousValue;
		}
	}
}

test('uses patient master 4 when ONKOSTAR_PATIENTENSTAEMME is unset', async () => {
	// Given: the patient-master variable is absent.
	// When: the SQL catalogue is loaded.
	const { states } = await importStatements(undefined, 'default');
	const filteredStatements = Object.values(states).filter((sql) => sql.includes('personenstamm'));

	// Then: the existing collection set and patient-master 4 restriction remain intact.
	assert.equal(Object.keys(states).length, 14);
	assert.equal(filteredStatements.length, 13);
	assert.ok(filteredStatements.every((sql) => /personenstamm\s*=\s*4/.test(sql)));
});

test('uses every configured patient master when multiple values are provided', async () => {
	// Given: three distinct patient masters in the environment.
	// When: the SQL catalogue is loaded.
	const { states } = await importStatements('4, 7,9', 'multiple');
	const filteredStatements = Object.values(states).filter((sql) =>
		sql.includes('patient master filter')
	);

	// Then: all patient-scoped statements use exactly the configured list.
	assert.equal(filteredStatements.length, 13);
	assert.ok(
		filteredStatements.every((sql) =>
			/patient master filter \*\/ (?:\w+\.)?personenstamm IN \(4, 7, 9\)/.test(sql)
		)
	);
});

test('does not restrict patient masters when the variable is empty', async () => {
	// Given: an explicitly empty patient-master variable.
	// When: the SQL catalogue is loaded.
	const { states } = await importStatements('', 'all');
	const unrestrictedStatements = Object.values(states).filter((sql) =>
		sql.includes('patient master filter')
	);

	// Then: every formerly scoped statement contains only the neutral predicate.
	assert.equal(unrestrictedStatements.length, 13);
	assert.ok(unrestrictedStatements.every((sql) => /patient master filter \*\/ 1 = 1/.test(sql)));
	assert.ok(
		Object.values(states).every((sql) => {
			const executableSql = sql
				.split('\n')
				.filter((line) => !line.trimStart().startsWith('--'))
				.join('\n');
			return !/personenstamm\s*(?:=|IN)\s*/.test(executableSql);
		})
	);
});

test('rejects empty entries in the patient-master list', async () => {
	// Given: a patient-master list with an empty entry.
	// When/Then: loading the SQL catalogue rejects the malformed boundary value.
	await assert.rejects(
		importStatements('4,,7', 'empty-entry'),
		/ONKOSTAR_PATIENTENSTAEMME.*comma-separated positive integers/
	);
});

test('rejects negative patient masters', async () => {
	// Given: a negative patient-master value.
	// When/Then: loading the SQL catalogue rejects the malformed boundary value.
	await assert.rejects(
		importStatements('4,-1', 'negative'),
		/ONKOSTAR_PATIENTENSTAEMME.*comma-separated positive integers/
	);
});

test('rejects non-numeric patient masters', async () => {
	// Given: a non-numeric patient-master value.
	// When/Then: loading the SQL catalogue rejects the malformed boundary value.
	await assert.rejects(
		importStatements('4,x', 'non-numeric'),
		/ONKOSTAR_PATIENTENSTAEMME.*comma-separated positive integers/
	);
});
