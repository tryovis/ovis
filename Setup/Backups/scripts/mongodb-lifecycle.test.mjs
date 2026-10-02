import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(scripts, '../../..');
const collections = ['platformConfiguration', 'platformDocument', 'usageEvent', 'user'];
const bash = [process.env.OVIS_TEST_BASH,
	...(process.platform === 'win32' ? ['C:/Program Files/Git/bin/bash.exe'] : []), 'bash']
	.filter(Boolean).find(candidate => spawnSync(candidate, ['-c', 'exit 0']).status === 0);
const composeAvailable = spawnSync('docker', ['compose', 'version']).status === 0;
const options = { skip: bash && composeAvailable ? false : 'Bash and the Docker Compose CLI are required' };
const posix = value => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

// Execute the actual inline Compose hooks and restore script; only MongoDB is simulated.
const mongo = String.raw`
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const root = process.env.MOCK_ROOT;
const [command, ...args] = process.argv.slice(2);
const argument = flag => args[args.indexOf(flag) + 1];
const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
const checkpoint = path.join(root, 'checkpoint.json');
const event = value => fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify({ command, ...value }) + '\n');
const live = name => path.join(root, 'live', name + '.bson');
if (command === 'mongosh') {
  const database = name => ({
    runCommand: spec => {
      if (spec.dbHash !== 1) throw Error('Unexpected Mongo command');
      event({ hashCollections: spec.collections });
      const hash = createHash('md5');
      for (const collection of [...spec.collections].sort()) {
        hash.update(collection);
        if (fs.existsSync(live(collection))) hash.update(fs.readFileSync(live(collection)));
      }
      return { ok: 1, md5: hash.digest('hex') };
    },
    getCollectionInfos: ({name}) => fs.existsSync(live(name)) ? [{name}] : [],
    getCollection: collection => collection === 'shutdownCheckpoint' ? {
      deleteOne: () => { fs.rmSync(checkpoint, {force: true}); return {acknowledged: true}; },
      replaceOne: (filter, document) => { fs.writeFileSync(checkpoint, JSON.stringify(document)); return {acknowledged: true}; },
      findOne: () => fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint)) : null
    } : {
      countDocuments: filter => (state.ids[collection] || []).filter(id => !(filter._id?.$nin || []).includes(id)).length
    }
  });
  vm.runInNewContext(argument('--eval'), {
    db: { getSiblingDB: database, adminCommand: () => ({ok: 1}) },
    print: value => process.stdout.write(String(value) + '\n'),
    quit: code => process.exit(code),
    process: {env: process.env},
    Date
  });
} else if (command === 'mongodump') {
  const collection = argument('--collection');
  event({collection});
  if (collection === state.failDump || !fs.existsSync(live(collection))) process.exit(12);
  const target = path.join(argument('--out'), argument('--db'));
  fs.mkdirSync(target, {recursive: true});
  fs.copyFileSync(live(collection), path.join(target, collection + '.bson'));
  if (collection === state.mutateDuringDump) fs.appendFileSync(live(collection), ' changed while dumping');
} else if (command === 'mongorestore') {
  const collection = argument('--collection');
  event({collection, source: args.at(-1)});
  fs.copyFileSync(args.at(-1), live(collection));
} else throw Error('Unexpected mock command');
`;

function fixture(t) {
	const root = fs.mkdtempSync(path.join(repository, '.mongodb-lifecycle-test-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	for (const directory of ['bin', 'backups', 'live', 'temp', 'Setup/Backups']) fs.mkdirSync(path.join(root, directory), { recursive: true });
	fs.writeFileSync(path.join(root, 'mongo.mjs'), mongo);
	fs.writeFileSync(path.join(root, '.env'), '');
	for (const command of ['mongosh', 'mongodump', 'mongorestore']) {
		fs.writeFileSync(path.join(root, 'bin', command),
			`#!/usr/bin/env bash\nexec ${quote(posix(process.execPath))} ${quote(posix(path.join(root, 'mongo.mjs')))} ${command} "$@"\n`, { mode: 0o755 });
	}
	for (const collection of collections) fs.writeFileSync(path.join(root, 'live', `${collection}.bson`),
		Buffer.from(`%PDF-1.7\n${collection}\0\xff\n%%EOF`, 'latin1'));
	const state = { ids: {} };
	const save = () => fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(state));
	save();
	const env = {
		...process.env,
		MOCK_ROOT: root, TMPDIR: posix(path.join(root, 'temp')), BACKUP_ROOT: posix(path.join(root, 'backups')),
		MONGO_BACKUP_DBS: 'onc_test', MONGO_BACKUP_COLLECTIONS: 'user', MONGO_BACKUP_REQUIRED_COLLECTIONS: 'usageEvent',
		MONGO_RESTORE_DBS: 'onc_test', MONGO_RESTORE_COLLECTIONS: 'user', MONGO_RESTORE_REQUIRED_COLLECTIONS: 'usageEvent',
		MONGO_RESTORE_IGNORE_IDS: 'ovis-root', OVIS_IMPORT_MODE: 'ONKOSTAR'
	};
	const prefix = `export PATH=${quote(posix(path.join(root, 'bin')))}:/usr/bin:/bin:"$PATH"\n`;
	const runHook = hook => {
		assert.equal(hook.command[0], 'bash');
		const args = hook.command.slice(1);
		// `compose config` escapes dollars for a round trip back into Compose YAML.
		args[args.length - 1] = prefix + args.at(-1).replaceAll('$$', '$');
		return spawnSync(bash, args, { env: { ...env, ...hook.environment }, encoding: 'utf8', timeout: 20000 });
	};
	const restore = () => spawnSync(bash, ['-c', `${prefix}exec bash "$1"`, 'restore', posix(path.join(scripts, 'mongodb-restore.sh'))],
		{ env, encoding: 'utf8', timeout: 20000 });
	const render = composeFile => {
		fs.copyFileSync(path.join(repository, composeFile), path.join(root, composeFile));
		fs.copyFileSync(path.join(repository, 'Setup/Backups/compose-hooks.yaml'), path.join(root, 'Setup/Backups/compose-hooks.yaml'));
		const configEnv = { ...env, APP_DOMAIN: 'localhost', KEYCLOAK_ADMIN: 'admin', KEYCLOAK_ADMIN_PASSWORD: 'example',
			KEYCLOAK_CLIENT_SECRET: 'example', KEYCLOAK_PORT: '8180', NGINX_HTTP_PORT: '8080', NGINX_HTTPS_PORT: '8443',
			NGINX_PROXY_MODE: 'true', NGINX_SSL_ENABLED: 'false', POSTGRES_PASSWORD: 'example' };
		const result = spawnSync('docker', ['compose', '-f', composeFile, 'config', '--format', 'json'], { cwd: root, env: configEnv, encoding: 'utf8' });
		assert.equal(result.status, 0, result.stderr || result.stdout);
		const services = JSON.parse(result.stdout).services;
		return { backup: services['mongodb-backup'].pre_stop[0], guard: services['ovis-backend-database-mongodb'].pre_stop[0] };
	};
	const events = () => fs.existsSync(path.join(root, 'events.jsonl'))
		? fs.readFileSync(path.join(root, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
	return { root, state, save, env, runHook, restore, render, events };
}

function succeeds(result) {
	assert.equal(result.status, 0, result.stderr || result.stdout);
}

function fails(result) {
	assert.equal(result.error, undefined);
	assert.equal(typeof result.status, 'number');
	assert.notEqual(result.status, 0, result.stderr || result.stdout);
}

for (const composeFile of ['compose.yaml', 'compose-image.yaml']) {
	test(`${composeFile}: a legacy running container saves uploads and the shutdown archive wins over a later legacy snapshot`, options, t => {
		const f = fixture(t);
		const hooks = f.render(composeFile);
		const pdf = fs.readFileSync(path.join(f.root, 'live/platformDocument.bson'));
		succeeds(f.runHook(hooks.backup));
		succeeds(f.runHook(hooks.guard));
		assert.ok(fs.statSync(path.join(f.root, 'backups/.ovis-shutdown.tar')).isFile());
		assert.deepEqual(f.events().filter(event => event.command === 'mongodump').map(event => event.collection).sort(), collections);
		const checkpoint = JSON.parse(fs.readFileSync(path.join(f.root, 'checkpoint.json')));
		assert.deepEqual(checkpoint.collections, collections);
		const laterLegacySnapshot = path.join(f.root, 'backups/99991231-235959/onc_test');
		fs.mkdirSync(laterLegacySnapshot, { recursive: true });
		fs.writeFileSync(path.join(laterLegacySnapshot, 'user.bson'), 'stale user-only legacy backup');
		for (const collection of collections) fs.rmSync(path.join(f.root, 'live', `${collection}.bson`));
		succeeds(f.restore());
		assert.deepEqual(fs.readFileSync(path.join(f.root, 'live/platformDocument.bson')), pdf);
		assert.deepEqual(f.events().filter(event => event.command === 'mongorestore').map(event => event.collection).sort(), collections);
	});
}

test('a failed shutdown dump clears an earlier checkpoint and prevents the database guard from succeeding', options, t => {
	const f = fixture(t);
	const hooks = f.render('compose.yaml');
	succeeds(f.runHook(hooks.backup));
	const originalArchive = fs.readFileSync(path.join(f.root, 'backups/.ovis-shutdown.tar'));
	f.state.failDump = 'platformDocument'; f.save();
	const failedBackup = f.runHook(hooks.backup);
	fails(failedBackup);
	assert.match(failedBackup.stderr, /shutdown backup failed/);
	assert.equal(fs.existsSync(path.join(f.root, 'checkpoint.json')), false);
	assert.deepEqual(fs.readFileSync(path.join(f.root, 'backups/.ovis-shutdown.tar')), originalArchive);
	fails(f.runHook(hooks.guard));
});

test('a write during the shutdown dump prevents publication and rejects the database shutdown guard', options, t => {
	const f = fixture(t);
	const hooks = f.render('compose.yaml');
	f.state.mutateDuringDump = 'platformDocument'; f.save();
	const failedBackup = f.runHook(hooks.backup);
	fails(failedBackup);
	assert.match(failedBackup.stderr, /changed during shutdown backup/);
	assert.equal(fs.existsSync(path.join(f.root, 'backups/.ovis-shutdown.tar')), false);
	assert.equal(fs.existsSync(path.join(f.root, 'checkpoint.json')), false);
	const failedGuard = f.runHook(hooks.guard);
	fails(failedGuard);
	assert.match(failedGuard.stderr, /No matching successful shutdown backup/);
});

test('a write after the checkpoint is detected by the database shutdown guard', options, t => {
	const f = fixture(t);
	const hooks = f.render('compose.yaml');
	succeeds(f.runHook(hooks.backup));
	fs.appendFileSync(path.join(f.root, 'live/platformDocument.bson'), 'later admin upload');
	const failedGuard = f.runHook(hooks.guard);
	fails(failedGuard);
	assert.match(failedGuard.stderr, /changed after its shutdown backup/);
});

test('a newer complete scheduled snapshot supersedes an older shutdown archive', options, t => {
	const f = fixture(t);
	const hooks = f.render('compose.yaml');
	succeeds(f.runHook(hooks.backup));
	const timestamp = '99991231-235959-999999999';
	const latest = path.join(f.root, 'backups', timestamp);
	fs.mkdirSync(path.join(latest, 'onc_test'), { recursive: true });
	fs.writeFileSync(path.join(latest, '.ovis-complete'), timestamp);
	fs.writeFileSync(path.join(latest, '.ovis-collections'), collections.map(collection => `onc_test/${collection}`).join('\n') + '\n');
	const pdf = Buffer.from('newer scheduled PDF upload');
	for (const collection of collections) {
		fs.writeFileSync(path.join(latest, 'onc_test', `${collection}.bson`), collection === 'platformDocument' ? pdf : collection);
		fs.rmSync(path.join(f.root, 'live', `${collection}.bson`));
	}
	succeeds(f.restore());
	assert.deepEqual(fs.readFileSync(path.join(f.root, 'live/platformDocument.bson')), pdf);
	assert.ok(f.events().filter(event => event.command === 'mongorestore').every(event => event.source.includes(timestamp)));
});

test('a corrupt shutdown archive aborts restore without dropping a collection', options, t => {
	const f = fixture(t);
	fs.writeFileSync(path.join(f.root, 'backups/.ovis-shutdown.tar'), 'incomplete archive data');
	const result = f.restore();
	fails(result);
	assert.deepEqual(f.events().filter(event => event.command === 'mongorestore'), []);
});

test('an archive with an extra backup-only collection still restores the protected application collections', options, t => {
	const f = fixture(t);
	f.env.MONGO_BACKUP_COLLECTIONS = 'user,customArchive';
	fs.writeFileSync(path.join(f.root, 'live/customArchive.bson'), 'custom data');
	const hooks = f.render('compose.yaml');
	succeeds(f.runHook(hooks.backup));
	succeeds(f.runHook(hooks.guard));
	assert.ok(f.events().some(event => event.command === 'mongodump' && event.collection === 'customArchive'));
	for (const collection of collections) fs.rmSync(path.join(f.root, 'live', `${collection}.bson`));
	succeeds(f.restore());
	assert.deepEqual(f.events().filter(event => event.command === 'mongorestore').map(event => event.collection).sort(), collections);
});

test('a newer scheduled snapshot missing archive collection coverage cannot supersede the richer shutdown archive', options, t => {
	const f = fixture(t);
	f.env.MONGO_BACKUP_COLLECTIONS = 'user,customArchive';
	f.env.MONGO_RESTORE_COLLECTIONS = 'user,customArchive';
	fs.writeFileSync(path.join(f.root, 'live/customArchive.bson'), 'custom data that must survive');
	const expectedPdf = fs.readFileSync(path.join(f.root, 'live/platformDocument.bson'));
	const hooks = f.render('compose.yaml');
	succeeds(f.runHook(hooks.backup));
	const timestamp = '99991231-235959-999999999';
	const latest = path.join(f.root, 'backups', timestamp);
	fs.mkdirSync(path.join(latest, 'onc_test'), { recursive: true });
	fs.writeFileSync(path.join(latest, '.ovis-complete'), timestamp);
	fs.writeFileSync(path.join(latest, '.ovis-collections'), collections.map(collection => `onc_test/${collection}`).join('\n') + '\n');
	for (const collection of collections) fs.writeFileSync(path.join(latest, 'onc_test', `${collection}.bson`), 'incomplete old-config final snapshot');
	for (const collection of [...collections, 'customArchive']) fs.rmSync(path.join(f.root, 'live', `${collection}.bson`));
	succeeds(f.restore());
	assert.deepEqual(fs.readFileSync(path.join(f.root, 'live/platformDocument.bson')), expectedPdf);
	assert.equal(fs.readFileSync(path.join(f.root, 'live/customArchive.bson'), 'utf8'), 'custom data that must survive');
});
