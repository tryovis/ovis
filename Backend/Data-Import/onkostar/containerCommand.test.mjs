import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dockerfile = await readFile(new URL('./Dockerfile', import.meta.url), 'utf8');
const [, ...shellArgs] = JSON.parse(dockerfile.match(/^CMD (.+)$/m)[1]);
const shell =
	process.platform === 'win32'
		? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/usr/bin/sh.exe')
		: '/bin/sh';
const mocks = `
PATH="$MOCK_BIN:$PATH"
export PATH
node() {
  printf 'NODE:%s\\n' "$1"
  if [ "$1" = mdbConnect.mjs ]; then
    return "$GENERATION_STATUS"
  fi
  printf 'UPLOAD:%s\\n' "$OMOCK_TO_UPLOAD"
  return "$UPLOAD_STATUS"
}
`;

async function run(t, { generation = 0, upload = 0, external = false } = {}) {
	const directory = await mkdtemp(path.join(tmpdir(), 'ovis-container-command-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const externalFile = path.join(directory, 'external file.json').replaceAll('\\', '/');
	const mockBin = directory
		.replaceAll('\\', '/')
		.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
	await writeFile(
		path.join(directory, 'tail'),
		'#!/bin/sh\nprintf \'KEEPALIVE:tail %s\\n\' "$*"\n',
		{ mode: 0o755 }
	);
	if (external) await writeFile(externalFile, '{}');
	const result = spawnSync(shell, [...shellArgs.slice(0, -1), mocks + shellArgs.at(-1)], {
		encoding: 'utf8',
		timeout: 10000,
		windowsHide: true,
		env: {
			...process.env,
			OVIS_OMOCK_FILE: externalFile,
			MOCK_BIN: mockBin,
			GENERATION_STATUS: String(generation),
			UPLOAD_STATUS: String(upload)
		}
	});
	assert.ifError(result.error);
	return { ...result, externalFile };
}

test(
	'failed generation stops the container before upload and keepalive',
	{ skip: !existsSync(shell) },
	async (t) => {
		const result = await run(t, { generation: 7 });
		assert.equal(result.status, 7, result.stderr);
		assert.match(result.stdout, /NODE:mdbConnect.mjs/);
		assert.doesNotMatch(result.stdout, /NODE:upload|KEEPALIVE|imported \(uploaded\)/);
	}
);

test(
	'failed upload stops the container without claiming success',
	{ skip: !existsSync(shell) },
	async (t) => {
		const result = await run(t, { upload: 8 });
		assert.equal(result.status, 8, result.stderr);
		assert.match(result.stdout, /NODE:upload-omock.mjs/);
		assert.doesNotMatch(result.stdout, /KEEPALIVE|imported \(uploaded\)/);
	}
);

test(
	'successful generation uploads its output and keeps the container alive',
	{ skip: !existsSync(shell) },
	async (t) => {
		const result = await run(t);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /UPLOAD:\/shared\/omock.json/);
		assert.match(result.stdout, /imported \(uploaded\)/);
		assert.match(result.stdout, /KEEPALIVE:tail -f \/dev\/null/);
	}
);

test(
	'external input skips generation and preserves paths containing spaces',
	{ skip: !existsSync(shell) },
	async (t) => {
		const result = await run(t, { external: true, generation: 7 });
		assert.equal(result.status, 0, result.stderr);
		assert.doesNotMatch(result.stdout, /NODE:mdbConnect/);
		assert.ok(result.stdout.includes(`UPLOAD:${result.externalFile}`));
		assert.match(result.stdout, /KEEPALIVE/);
	}
);
