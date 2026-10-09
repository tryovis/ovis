import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
	stdin: {
		contents: `export * from './lib/export-workflow'; export { saveTableCsv } from './lib/table-download';`,
		resolveDir: fileURLToPath(new URL('.', import.meta.url)),
		loader: 'ts'
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});
const { saveExportBlob, saveTableCsv, createExportFingerprint, beginExport, ExportAuditError } =
	await import(
		`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
	);

function fixture({ native = false, cancel = false, failPrepare = false, failWrite = false } = {}) {
	const calls = [];
	const chunks = [];
	let blob;
	let metadata;
	let request;
	const session = {
		id: 'abcdef0123456789abcdef01',
		fileName: 'patients_abcdef0123456789abcdef01.csv',
		async prepare(value) {
			calls.push('prepare');
			metadata = value;
			if (failPrepare) throw new ExportAuditError();
		},
		async complete(outcome) {
			calls.push(outcome);
		}
	};
	const link = {
		href: '',
		download: '',
		style: {},
		click() {
			calls.push('click');
		}
	};
	const env = {
		async beginAudit(value) {
			calls.push('confirm');
			request = value;
			if (cancel) return null;
			calls.push('create');
			return session;
		},
		document: { createElement: () => link, body: { appendChild() {}, removeChild() {} } },
		createObjectUrl(value) {
			blob = value;
			calls.push('blob');
			return 'blob:test';
		},
		revokeObjectUrl() {
			calls.push('revoke');
		},
		scheduleCleanup(fn) {
			fn();
		},
		yieldControl: async () => {},
		requestSaveFile: native
			? async (name) => {
					assert.equal(name, session.fileName);
					calls.push('picker');
					return {
						async createWritable() {
							calls.push('writable');
							return {
								async write(chunk) {
									calls.push('write');
									chunks.push(chunk);
									if (failWrite) throw Error('disk full');
								},
								async close() {
									calls.push('close');
								},
								async abort() {
									calls.push('abort');
								}
							};
						}
					};
			  }
			: undefined
	};
	return {
		env,
		calls,
		session,
		link,
		chunks,
		get blob() {
			return blob;
		},
		get metadata() {
			return metadata;
		},
		get request() {
			return request;
		}
	};
}

function tableRequest(rows = [{ id: 1, value: 'ä;"quoted"\n=private' }]) {
	return {
		downloadName: 'patients',
		headers: ['Identifier', 'Value'],
		fields: ['id', 'value'],
		context: {
			title: 'Patients',
			filterActive: true,
			filter: '{"operand":"OR","children":[]}',
			selection: { sortField: 'id' }
		},
		getRows: async () => rows,
		onProgress() {}
	};
}

test('no registered audit service fails closed', async () => {
	await assert.rejects(
		beginExport({ fileName: 'x.csv', kind: 'TABLE', format: 'CSV' }),
		ExportAuditError
	);
});

test('incremental fingerprint matches Node SHA-256 across Unicode and chunk boundaries', () => {
	for (const length of [0, 1, 55, 56, 63, 64, 65, 100_000]) {
		const data = Buffer.from('Patient ä🙂\n'.repeat(length));
		const hash = createExportFingerprint();
		for (let i = 0; i < data.length; i += 37) hash.update(data.subarray(i, i + 37));
		assert.deepEqual(hash.digest(), {
			sizeBytes: data.length,
			sha256: createHash('sha256').update(data).digest('hex')
		});
	}
});

test('cancelled confirmation never loads rows, opens picker, creates audit or releases bytes', async () => {
	const f = fixture({ native: true, cancel: true });
	const request = tableRequest();
	request.getRows = () => assert.fail('must not load');
	assert.equal(await saveTableCsv(request, f.env), 'cancelled');
	assert.deepEqual(f.calls, ['confirm']);
});

test('audit creation failure prevents picker, row fetch and download', async () => {
	const f = fixture({ native: true });
	f.env.beginAudit = async () => {
		throw new ExportAuditError();
	};
	const request = tableRequest();
	request.getRows = () => assert.fail('must not load');
	await assert.rejects(saveTableCsv(request, f.env), ExportAuditError);
	assert.deepEqual(f.calls, []);
});

test('native CSV persists exact BOM/UTF-8 fingerprint before creating writable and only completes after close', async () => {
	const f = fixture({ native: true });
	assert.equal(await saveTableCsv(tableRequest(), f.env), 'saved');
	const bytes = Buffer.from(f.chunks.join(''));
	assert.deepEqual(f.metadata, {
		sizeBytes: bytes.length,
		sha256: createHash('sha256').update(bytes).digest('hex'),
		rowCount: 1
	});
	assert.equal(f.request.context.selection.sortField, 'id');
	assert.deepEqual(f.request.context.selection.headers, ['Identifier', 'Value']);
	assert.ok(f.calls.indexOf('prepare') < f.calls.indexOf('writable'));
	assert.ok(f.calls.indexOf('close') < f.calls.indexOf('SAVED'));
	assert.ok(!f.calls.includes('DOWNLOAD_STARTED'));
});

test('Blob CSV fingerprint includes final bytes and the server-issued filename is used', async () => {
	const f = fixture();
	assert.equal(await saveTableCsv(tableRequest(), f.env), 'download-started');
	const bytes = Buffer.from(await f.blob.arrayBuffer());
	assert.equal(f.metadata.sizeBytes, bytes.length);
	assert.equal(f.metadata.sha256, createHash('sha256').update(bytes).digest('hex'));
	assert.equal(f.link.download, f.session.fileName);
	assert.ok(f.calls.indexOf('prepare') < f.calls.indexOf('blob'));
	assert.ok(f.calls.indexOf('click') < f.calls.indexOf('DOWNLOAD_STARTED'));
});

test('unavailable persistence aborts CSV before any data is written or downloaded', async () => {
	for (const native of [false, true]) {
		const f = fixture({ native, failPrepare: true });
		await assert.rejects(saveTableCsv(tableRequest(), f.env), ExportAuditError);
		assert.ok(f.calls.includes('FAILED'));
		assert.ok(
			!f.calls.some((value) => ['write', 'writable', 'blob', 'click', 'SAVED'].includes(value))
		);
	}
});

test('native picker cancellation is recorded and never fetches data', async () => {
	const f = fixture({ native: true });
	f.env.requestSaveFile = async () => {
		throw new DOMException('Cancelled', 'AbortError');
	};
	const request = tableRequest();
	request.getRows = () => assert.fail('must not load');
	assert.equal(await saveTableCsv(request, f.env), 'cancelled');
	assert.deepEqual(f.calls, ['confirm', 'create', 'CANCELLED']);
});

test('lost transient activation falls back to the same audited download', async () => {
	const f = fixture({ native: true });
	f.env.requestSaveFile = async () => {
		throw new DOMException('User activation expired', 'SecurityError');
	};
	assert.equal(await saveTableCsv(tableRequest(), f.env), 'download-started');
	assert.ok(f.calls.includes('prepare'));
	assert.ok(f.calls.includes('DOWNLOAD_STARTED'));
});

test('write error aborts the stream and records failure without success', async () => {
	const f = fixture({ native: true, failWrite: true });
	await assert.rejects(saveTableCsv(tableRequest(), f.env), /disk full/);
	assert.ok(f.calls.includes('abort'));
	assert.ok(f.calls.includes('FAILED'));
	assert.ok(!f.calls.includes('SAVED'));
});

test('data mutation after fingerprint cannot release an artifact with a different hash', async () => {
	const rows = [{ id: 1, value: 'before' }];
	const f = fixture();
	f.session.prepare = async () => {
		rows[0].value = 'after';
	};
	await assert.rejects(saveTableCsv(tableRequest(rows), f.env), /data changed/);
	assert.ok(!f.calls.includes('click'));
	assert.ok(f.calls.includes('FAILED'));
});

test('PNG and JSON pass through confirmation, fingerprint and persistence before release', async () => {
	for (const [kind, format, mime] of [
		['CHART', 'PNG', 'image/png'],
		['FILTER', 'JSON', 'application/json']
	]) {
		const f = fixture();
		const blob = new Blob(['filter ä'], { type: mime });
		assert.equal(
			await saveExportBlob({ fileName: `x.${format.toLowerCase()}`, kind, format, blob }, f.env),
			'download-started'
		);
		assert.equal(f.request.kind, kind);
		assert.equal(f.metadata.sizeBytes, blob.size);
		assert.equal(
			f.metadata.sha256,
			createHash('sha256')
				.update(Buffer.from(await blob.arrayBuffer()))
				.digest('hex')
		);
		assert.ok(f.calls.indexOf('prepare') < f.calls.indexOf('click'));
		const denied = fixture({ failPrepare: true });
		await assert.rejects(
			saveExportBlob({ fileName: 'x.json', kind, format, blob }, denied.env),
			ExportAuditError
		);
		assert.ok(!denied.calls.includes('click'));
	}
});
