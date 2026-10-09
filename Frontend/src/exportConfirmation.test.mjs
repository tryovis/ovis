import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = await build({
	entryPoints: [fileURLToPath(new URL('./store/exportConfirmation.ts', import.meta.url))],
	bundle: true,
	format: 'esm',
	platform: 'node',
	write: false,
	logLevel: 'silent'
});
const { exportConfirmation, requestExportConfirmation, resolveExportConfirmation } = await import(
	`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
let current = null;
exportConfirmation.subscribe((value) => {
	current = value;
});

test('each export requires a fresh decision without remembering prior acceptance', async () => {
	const first = requestExportConfirmation({ fileName: 'first.csv', title: 'First' });
	const firstId = current.id;
	assert.equal(current.fileName, 'first.csv');
	resolveExportConfirmation(firstId, true);
	assert.equal(await first, true);
	assert.equal(current, null);

	const next = requestExportConfirmation({ fileName: 'next.png', title: 'Next' });
	assert.notEqual(current.id, firstId);
	resolveExportConfirmation(current.id, false);
	assert.equal(await next, false);
	assert.equal(current, null);
});

test('concurrent export cannot replace the pending confirmation', async () => {
	const first = requestExportConfirmation({ fileName: 'original.csv', title: 'Original' });
	const firstId = current.id;
	const concurrent = requestExportConfirmation({ fileName: 'other.csv', title: 'Other' });
	assert.equal(await concurrent, false);
	assert.equal(current.id, firstId);
	assert.equal(current.fileName, 'original.csv');
	resolveExportConfirmation(firstId, false);
	assert.equal(await first, false);
});

test('stale dialog events cannot resolve a newer confirmation', async () => {
	const first = requestExportConfirmation({ fileName: 'first.csv', title: 'First' });
	const staleId = current.id;
	resolveExportConfirmation(staleId, false);
	await first;
	const second = requestExportConfirmation({ fileName: 'second.csv', title: 'Second' });
	const secondId = current.id;
	resolveExportConfirmation(staleId, true);
	assert.equal(current.id, secondId);
	resolveExportConfirmation(secondId, true);
	assert.equal(await second, true);
});

test('confirmation and audit messages exist in both locales with matching placeholders', async () => {
	const source = await readFile(new URL('./store/translations.js', import.meta.url), 'utf8');
	const { default: dictionary } = await import(
		`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
	);
	const keys = Object.keys(dictionary.en).filter((key) =>
		/^export(?:Confirmation|Audit)/.test(key)
	);
	const placeholders = (text) => [...text.matchAll(/{{(\w+)}}/g)].map((match) => match[1]).sort();
	for (const key of keys) {
		assert.ok(dictionary.de[key], key);
		assert.deepEqual(placeholders(dictionary.en[key]), placeholders(dictionary.de[key]), key);
	}
	assert.ok(dictionary.en.exportAuditCompletionFailed.includes('{{id}}'));
	assert.ok(dictionary.de.exportAuditLoginRequired.includes('persönlichen OVIS-Konto'));
});
