import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appCss = await readFile(new URL('./app.css', import.meta.url), 'utf8');
const deathChart = await readFile(
	new URL('./routes/patient-cohort/PatientCohortDeathChart.svelte', import.meta.url),
	'utf8'
);
const genderChart = await readFile(
	new URL('./routes/patient-cohort/PatientCohortGenderChart.svelte', import.meta.url),
	'utf8'
);

test('non-maximized cohort pies are constrained by their dashboard cells', () => {
	assert.match(
		appCss,
		/\.patient-cohort-pie-root:not\(\.maximized\)\s*\{[^}]*display:\s*flex;[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
	);
	assert.match(
		appCss,
		/\.patient-cohort-pie-root:not\(\.maximized\) \.patient-cohort-pie-view\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s
	);
});

test('cohort pies fill the available height outside the short-desktop breakpoint', () => {
	for (const source of [deathChart, genderChart]) {
		assert.match(
			source,
			/function shouldFillContainer\(\): boolean \{\s*return !maximizePatientCohort(?:Death|Gender)Chart;\s*\}/s
		);
	}
});
