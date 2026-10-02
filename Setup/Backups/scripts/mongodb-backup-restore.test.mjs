import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(scripts, '../../..');
const protectedCollections = ['user', 'usageEvent', 'platformConfiguration', 'platformDocument'];
const shell = [
	process.env.OVIS_TEST_BASH,
	...(process.platform === 'win32' ? ['C:/Program Files/Git/bin/bash.exe'] : []),
	'bash'
].filter(Boolean).find((candidate) => spawnSync(candidate, ['-c', 'exit 0']).status === 0);
const shellOptions = { skip: shell ? false : 'Bash is required to exercise the production scripts' };
const posix = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

// Only MongoDB is simulated: the real Bash control flow, files, signals and retention run normally.
const mockMongo = String.raw`
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = process.env.MOCK_ROOT;
const [command, ...args] = process.argv.slice(2);
const argument = (flag) => args[args.indexOf(flag) + 1];
const config = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
const event = (value) => fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify({command, ...value}) + '\n');
const collection = argument('--collection');
if (command === 'mongosh') {
  const script = argument('--eval');
  if (script.includes('adminCommand')) process.exit(0);
  vm.runInNewContext(script, {
    db: { getSiblingDB: () => ({ getCollectionInfos: ({name}) => config.absentCollection === name ? [] : [{name}], getCollection: (name) => ({ countDocuments: (filter) => {
      event({collection: name, filter});
      if (config.failCount === name) process.exit(19);
      if (config.invalidCount === name) return 'not-a-count';
      return (config.ids[name] || []).filter(id => !(filter._id?.$nin || []).includes(id)).length;
    } }) }) },
    print: (value) => process.stdout.write(String(value) + '\n')
  });
} else if (command === 'mongodump') {
  const destination = path.join(argument('--out'), argument('--db'));
  event({collection, destination});
  fs.mkdirSync(destination, {recursive: true});
  if (config.blockDump === collection && !fs.existsSync(path.join(root, 'allow-dump'))) {
    fs.writeFileSync(path.join(root, 'dump-blocked'), '');
    const deadline = Date.now() + 15000;
    while (!fs.existsSync(path.join(root, 'allow-dump'))) {
      if (Date.now() > deadline) process.exit(20);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  if (config.absentCollection === collection) process.exit(21);
  fs.copyFileSync(path.join(root, 'live', collection + '.bson'), path.join(destination, collection + '.bson'));
  fs.writeFileSync(path.join(destination, collection + '.metadata.json'), '{}');
  if (config.failDump === collection || config.absentCollection === collection) process.exit(21);
} else if (command === 'mongorestore') {
  event({collection, source: args.at(-1), drop: args.includes('--drop')});
  fs.copyFileSync(args.at(-1), path.join(root, 'live', collection + '.bson'));
} else {
  throw new Error('Unexpected mock command: ' + command);
}
`;

function fixture(t, extraCollections = []) {
	const root = fs.mkdtempSync(path.join(repository, '.mongodb-backup-test-'));
	const cleanup = [];
	t.after(async () => {
		await Promise.all(cleanup.map(action => action()));
		fs.rmSync(root, { recursive: true, force: true });
	});
	for (const directory of ['bin', 'live', 'backups']) fs.mkdirSync(path.join(root, directory));
	fs.writeFileSync(path.join(root, 'mock.mjs'), mockMongo);
	for (const command of ['mongosh', 'mongodump', 'mongorestore']) {
		fs.writeFileSync(path.join(root, 'bin', command),
			`#!/usr/bin/env bash\nexec ${quote(posix(process.execPath))} ${quote(posix(path.join(root, 'mock.mjs')))} ${command} "$@"\n`,
			{ mode: 0o755 });
	}
	const state = { ids: {} };
	const save = () => fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(state));
	save();
	for (const collection of [...protectedCollections, ...extraCollections]) {
		fs.writeFileSync(path.join(root, 'live', `${collection}.bson`), Buffer.from([0, 255, 128, ...Buffer.from(collection)]));
	}
	const env = {
		...process.env,
		MOCK_ROOT: root,
		BACKUP_ROOT: posix(path.join(root, 'backups')),
		BACKUP_INTERVAL_SECONDS: '30',
		MONGO_BACKUP_DBS: 'onc_test', MONGO_RESTORE_DBS: 'onc_test',
		MONGO_BACKUP_COLLECTIONS: 'user', MONGO_RESTORE_COLLECTIONS: 'user',
		MONGO_BACKUP_REQUIRED_COLLECTIONS: 'usageEvent', MONGO_RESTORE_REQUIRED_COLLECTIONS: 'usageEvent',
		MONGO_BACKUP_RETENTION: '0', MONGO_RESTORE_IGNORE_IDS: 'ovis-root', OVIS_IMPORT_MODE: 'ONKOSTAR'
	};
	const prefix = `export PATH=${quote(posix(path.join(root, 'bin')))}:/usr/bin:/bin:"$PATH"\n`;
	const events = () => fs.existsSync(path.join(root, 'events.jsonl'))
		? fs.readFileSync(path.join(root, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
	const snapshots = () => fs.readdirSync(path.join(root, 'backups')).filter(name => !name.startsWith('.')).sort();
	const snapshot = (name = '20260101-120000', collections = protectedCollections) => {
		const target = path.join(root, 'backups', name, 'onc_test');
		fs.mkdirSync(target, { recursive: true });
		for (const collection of collections) fs.copyFileSync(path.join(root, 'live', `${collection}.bson`), path.join(target, `${collection}.bson`));
	};
	const restore = () => spawnSync(shell, ['-c', `${prefix}exec bash "$1"`, 'restore-test', posix(path.join(scripts, 'mongodb-restore.sh'))],
		{ env, encoding: 'utf8', timeout: 20000 });
	return { root, state, save, env, prefix, events, snapshots, snapshot, restore, cleanup };
}

async function until(predicate, description, timeout = 15000) {
	const deadline = Date.now() + timeout;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`);
		await new Promise(resolve => setTimeout(resolve, 30));
	}
}

function startBackup(t, fixture) {
	// Bash sends SIGTERM itself because Node's Windows child.kill() forcibly terminates processes.
	const driver = `${fixture.prefix}
bash "$1" &
worker=$!
trap 'kill -KILL "$worker" 2>/dev/null || true' EXIT
for ((attempt=0; attempt<500; attempt++)); do
  if [[ -f "$2/stop" ]]; then
    kill -TERM "$worker"
    wait "$worker"
    result=$?
    trap - EXIT
    exit "$result"
  fi
  if ! kill -0 "$worker" 2>/dev/null; then wait "$worker"; exit $?; fi
  sleep 0.05
done
exit 99
`;
	const child = spawn(shell, ['-c', driver, 'backup-test', posix(path.join(scripts, 'mongodb-backup.sh')), posix(fixture.root)],
		{ env: fixture.env, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = '';
	child.stdout.on('data', data => { output += data; });
	child.stderr.on('data', data => { output += data; });
	const done = new Promise((resolve, reject) => {
		let closeTimer;
		child.once('error', reject);
		child.once('exit', () => {
			// Git Bash can leave a signalled sleep's inherited pipe open after its parent exits.
			closeTimer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); }, 100);
		});
		child.once('close', code => { clearTimeout(closeTimer); resolve({ code, output }); });
	});
	let stopped = false;
	const stop = async () => {
		if (!stopped) { stopped = true; fs.writeFileSync(path.join(fixture.root, 'stop'), ''); }
		return done;
	};
	fixture.cleanup.push(stop);
	return { stop, sleeping: async () => {
		try { await until(() => output.includes('Sleeping for'), 'backup interval'); }
		catch (error) { throw new Error(`${error.message}\n${output}`, { cause: error }); }
	} };
}

test('legacy settings protect all uploaded documents; SIGTERM saves the latest PDF before an empty-database restore', shellOptions, async t => {
	const f = fixture(t);
	const backup = startBackup(t, f);
	await backup.sleeping();
	const latestPdf = Buffer.from('%PDF-1.7\nLatest admin upload\0\xff\n%%EOF', 'latin1');
	fs.writeFileSync(path.join(f.root, 'live/platformDocument.bson'), latestPdf);
	const result = await backup.stop();
	assert.equal(result.code, 0, result.output);
	assert.equal(f.snapshots().length, 2, 'startup and shutdown each publish a complete snapshot');
	for (const snapshot of f.snapshots()) {
		assert.match(snapshot, /^\d{8}-\d{6}-\d{9}$/);
		assert.deepEqual(fs.readdirSync(path.join(f.root, 'backups', snapshot, 'onc_test')).filter(name => name.endsWith('.bson')).sort(),
			protectedCollections.map(name => `${name}.bson`).sort());
	}
	for (const collection of protectedCollections) fs.rmSync(path.join(f.root, 'live', `${collection}.bson`));
	const restored = f.restore();
	assert.equal(restored.status, 0, restored.stderr || restored.stdout);
	assert.deepEqual(fs.readFileSync(path.join(f.root, 'live/platformDocument.bson')), latestPdf);
	assert.deepEqual(f.events().filter(event => event.command === 'mongorestore').map(event => event.collection).sort(), [...protectedCollections].sort());
});

test('custom collections are additive and duplicate CSV entries are backed up once per snapshot', shellOptions, async t => {
	const f = fixture(t, ['custom']);
	f.env.MONGO_BACKUP_COLLECTIONS = ' custom, user,custom , platformDocument ';
	f.env.MONGO_BACKUP_REQUIRED_COLLECTIONS = 'custom, usageEvent,user';
	const backup = startBackup(t, f);
	await backup.sleeping();
	const result = await backup.stop();
	assert.equal(result.code, 0, result.output);
	const dumps = f.events().filter(event => event.command === 'mongodump');
	for (const destination of new Set(dumps.map(event => event.destination))) {
		assert.deepEqual(dumps.filter(event => event.destination === destination).map(event => event.collection).sort(), [...protectedCollections, 'custom'].sort());
	}
});

test('a snapshot remains hidden until every collection has been dumped successfully', shellOptions, async t => {
	const f = fixture(t);
	f.state.blockDump = 'platformDocument'; f.save();
	const backup = startBackup(t, f);
	await until(() => fs.existsSync(path.join(f.root, 'dump-blocked')), 'the last dump');
	assert.deepEqual(f.snapshots(), []);
	assert.ok(fs.readdirSync(path.join(f.root, 'backups')).some(name => name.startsWith('.pending-')));
	fs.writeFileSync(path.join(f.root, 'allow-dump'), '');
	await backup.sleeping();
	assert.equal((await backup.stop()).code, 0);
	assert.ok(fs.readdirSync(path.join(f.root, 'backups')).every(name => !name.startsWith('.pending-')));
});

test('failed dumps cannot publish or prune a good snapshot, and shutdown reports failure', shellOptions, async t => {
	const f = fixture(t);
	f.snapshot();
	f.snapshot('.pending-incomplete');
	f.env.MONGO_BACKUP_RETENTION = '1';
	f.state.failDump = 'platformDocument'; f.save();
	const backup = startBackup(t, f);
	await backup.sleeping();
	const result = await backup.stop();
	assert.notEqual(result.code, 0, result.output);
	assert.deepEqual(f.snapshots(), ['20260101-120000']);
	assert.ok(fs.existsSync(path.join(f.root, 'backups/.pending-incomplete')), 'retention must ignore unpublished snapshots');
});

test('successful retention keeps the latest complete snapshot and ignores unpublished directories', shellOptions, async t => {
	const f = fixture(t);
	f.snapshot(); f.snapshot('.pending-incomplete');
	f.env.MONGO_BACKUP_RETENTION = '1';
	const backup = startBackup(t, f);
	await backup.sleeping();
	const result = await backup.stop();
	assert.equal(result.code, 0, result.output);
	assert.equal(f.snapshots().length, 1);
	assert.notEqual(f.snapshots()[0], '20260101-120000');
	assert.ok(fs.existsSync(path.join(f.root, 'backups/.pending-incomplete')));
});

test('a collection absent in an older database does not prevent backing up existing collections', shellOptions, async t => {
	const f = fixture(t);
	f.state.absentCollection = 'platformConfiguration'; f.save();
	const backup = startBackup(t, f);
	await backup.sleeping();
	const result = await backup.stop();
	assert.equal(result.code, 0, result.output);
	assert.equal(f.snapshots().length, 2);
	assert.deepEqual(fs.readdirSync(path.join(f.root, 'backups', f.snapshots().at(-1), 'onc_test')).filter(name => name.endsWith('.bson')).sort(),
		['platformDocument.bson', 'usageEvent.bson', 'user.bson']);
});

test('restore fills empty collections without overwriting populated collections or selecting hidden staging directories', shellOptions, t => {
	const f = fixture(t, ['custom']);
	f.snapshot('20260101-120000', [...protectedCollections, 'custom']);
	f.snapshot('.pending-99999999-999999');
	f.env.MONGO_RESTORE_COLLECTIONS = 'custom,user,custom';
	f.env.MONGO_RESTORE_REQUIRED_COLLECTIONS = 'usageEvent,custom';
	f.state.ids = { user: ['existing-user'], usageEvent: ['ovis-root'], platformConfiguration: ['ovis-root'] }; f.save();
	const existingSettings = Buffer.from('settings already in the live database');
	fs.writeFileSync(path.join(f.root, 'live/platformConfiguration.bson'), existingSettings);
	const result = f.restore();
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const restores = f.events().filter(event => event.command === 'mongorestore');
	assert.deepEqual(restores.map(event => event.collection).sort(), ['custom', 'platformDocument']);
	assert.ok(restores.every(event => event.source.includes('20260101-120000') && event.drop));
	assert.deepEqual(fs.readFileSync(path.join(f.root, 'live/platformConfiguration.bson')), existingSettings);
	for (const event of f.events().filter(event => event.command === 'mongosh')) {
		assert.deepEqual(event.filter, event.collection === 'user' ? { _id: { $nin: ['ovis-root'] } } : {});
	}
});

for (const fault of ['invalidCount', 'failCount']) {
	test(`restore fails safely when the existing-document count is ${fault}`, shellOptions, t => {
		const f = fixture(t);
		f.snapshot();
		f.state[fault] = 'user'; f.save();
		const result = f.restore();
		assert.equal(result.error, undefined);
		assert.equal(typeof result.status, 'number');
		assert.notEqual(result.status, 0, result.stderr || result.stdout);
		assert.deepEqual(f.events().filter(event => event.command === 'mongorestore'), []);
	});
}

test('a seeded root account does not prevent restoring the user collection', shellOptions, t => {
	const f = fixture(t);
	f.snapshot();
	f.state.ids.user = ['ovis-root']; f.save();
	const result = f.restore();
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.ok(f.events().some(event => event.command === 'mongorestore' && event.collection === 'user'));
});

test('an existing uploaded document is preserved while an older backup restores missing users', shellOptions, t => {
	const f = fixture(t);
	f.snapshot('20260101-120000', ['user', 'platformDocument']);
	const livePdf = Buffer.from('a newer existing PDF');
	fs.writeFileSync(path.join(f.root, 'live/platformDocument.bson'), livePdf);
	f.state.ids.platformDocument = ['agreement']; f.save();
	const result = f.restore();
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.deepEqual(f.events().filter(event => event.command === 'mongorestore').map(event => event.collection), ['user']);
	assert.deepEqual(fs.readFileSync(path.join(f.root, 'live/platformDocument.bson')), livePdf);
});

test('first installation without snapshots succeeds without trying to restore data', shellOptions, t => {
	const f = fixture(t);
	const result = f.restore();
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.deepEqual(f.events(), []);
});

const composeAvailable = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' }).status === 0;
for (const composeFile of ['compose.yaml', 'compose-image.yaml']) {
	test(`${composeFile} protects the same host-backed collections and allows the shutdown backup to finish`,
		{ skip: composeAvailable ? false : 'Docker Compose CLI is required to render deployment settings' }, t => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ovis-backup-compose-'));
			t.after(() => fs.rmSync(root, { recursive: true, force: true }));
			fs.copyFileSync(path.join(repository, composeFile), path.join(root, composeFile));
			const hooksPath = path.join(repository, 'Setup/Backups/compose-hooks.yaml');
			if (fs.existsSync(hooksPath)) {
				fs.mkdirSync(path.join(root, 'Setup/Backups'), { recursive: true });
				fs.copyFileSync(hooksPath, path.join(root, 'Setup/Backups/compose-hooks.yaml'));
			}
			fs.writeFileSync(path.join(root, '.env'), '');
			const env = { ...process.env, APP_DOMAIN: 'localhost', KEYCLOAK_ADMIN: 'admin', KEYCLOAK_ADMIN_PASSWORD: 'example',
				KEYCLOAK_CLIENT_SECRET: 'example', KEYCLOAK_PORT: '8180', NGINX_HTTP_PORT: '8080', NGINX_HTTPS_PORT: '8443',
				NGINX_PROXY_MODE: 'true', NGINX_SSL_ENABLED: 'false', POSTGRES_PASSWORD: 'example' };
			for (const key of Object.keys(env)) if (/^MONGO_(BACKUP|RESTORE)_/.test(key)) delete env[key];
			const result = spawnSync('docker', ['compose', '-f', composeFile, 'config', '--format', 'json'], { cwd: root, env, encoding: 'utf8' });
			assert.equal(result.status, 0, result.stderr || result.stdout);
			const services = JSON.parse(result.stdout).services;
			const backup = services['mongodb-backup'];
			const restore = services['mongodb-restore'];
			for (const [service, prefix] of [[backup, 'MONGO_BACKUP'], [restore, 'MONGO_RESTORE']]) {
				const selected = new Set(`${service.environment[`${prefix}_COLLECTIONS`]},${service.environment[`${prefix}_REQUIRED_COLLECTIONS`]}`.split(','));
				for (const collection of protectedCollections) assert.ok(selected.has(collection), `${prefix} must include ${collection}`);
			}
			assert.equal(backup.stop_grace_period, '2m0s');
			const backupVolume = backup.volumes.find(volume => volume.target === '/var/backups/mongodb');
			const restoreVolume = restore.volumes.find(volume => volume.target === '/backups');
			assert.equal(backupVolume.type, 'bind');
			assert.equal(restoreVolume.type, 'bind');
			assert.equal(backupVolume.source, restoreVolume.source);
			assert.equal(restoreVolume.read_only, true);
			assert.equal(backup.depends_on['ovis-backend-database-mongodb'].condition, 'service_started');
			assert.equal(backup.depends_on['mongodb-restore'].condition, 'service_completed_successfully');
		});
}
