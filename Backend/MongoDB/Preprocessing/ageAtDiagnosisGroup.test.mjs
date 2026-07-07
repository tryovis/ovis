import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAgeAtDiagnosisGroup } from './ageAtDiagnosisGroup.mjs';

test('formatAgeAtDiagnosisGroup returns diagnosis age buckets at configured boundaries', () => {
	assert.equal(formatAgeAtDiagnosisGroup(0), '0-17');
	assert.equal(formatAgeAtDiagnosisGroup(17), '0-17');
	assert.equal(formatAgeAtDiagnosisGroup(18), '18-19');
	assert.equal(formatAgeAtDiagnosisGroup(19), '18-19');
	assert.equal(formatAgeAtDiagnosisGroup(20), '20-29');
	assert.equal(formatAgeAtDiagnosisGroup(99), '90-99');
	assert.equal(formatAgeAtDiagnosisGroup(100), '100+');
	assert.equal(formatAgeAtDiagnosisGroup(110), '100+');
});

test('formatAgeAtDiagnosisGroup returns null for missing or invalid ages', () => {
	assert.equal(formatAgeAtDiagnosisGroup(null), null);
	assert.equal(formatAgeAtDiagnosisGroup(undefined), null);
	assert.equal(formatAgeAtDiagnosisGroup(Number.NaN), null);
	assert.equal(formatAgeAtDiagnosisGroup(-1), null);
});
