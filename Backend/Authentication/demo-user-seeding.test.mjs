import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const authenticationDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(authenticationDir, '../..');
const buildRealmScript = path.join(authenticationDir, 'Keycloak/build-realm.sh');
const baseRealmPath = path.join(authenticationDir, 'Keycloak/ovis-realm.json');
const mongoInitPath = path.join(repositoryRoot, 'Backend/MongoDB/initdb.js');
const mongoRestorePath = path.join(repositoryRoot, 'Setup/Backups/scripts/mongodb-restore.sh');

async function buildRealm(importMode) {
	const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'ovis-demo-realm-'));
	const outputRealm = path.join(tempDir, 'ovis-realm.json');

	try {
		const result = spawnSync('/bin/sh', [buildRealmScript], {
			cwd: repositoryRoot,
			encoding: 'utf8',
			env: {
				...process.env,
				BASE_REALM: baseRealmPath,
				OUTPUT_REALM: outputRealm,
				OVIS_IMPORT_MODE: importMode,
				OVIS_ROOT_PASSWORD: 'root-secret',
				PUBLIC_LDAP_ENABLED: 'false'
			}
		});

		assert.equal(result.status, 0, result.stderr || result.stdout);
		return JSON.parse(await fsPromises.readFile(outputRealm, 'utf8'));
	} finally {
		await fsPromises.rm(tempDir, { recursive: true, force: true });
	}
}

function runMongoInit(importMode) {
	const insertedUsers = [];
	const userCollection = {
		insertMany(users) {
			insertedUsers.push(...users);
		}
	};
	const database = {
		createCollection() {},
		get user() {
			return userCollection;
		}
	};
	const context = vm.createContext({
		Date,
		db: {
			getSiblingDB() {
				return database;
			}
		},
		process: {
			env: {
				OVIS_IMPORT_MODE: importMode,
				OVIS_ROOT_USERNAME: 'ovis-root'
			}
		}
	});

	vm.runInContext(fs.readFileSync(mongoInitPath, 'utf8'), context);
	return insertedUsers;
}

async function runMongoRestore(importMode, ignoreIds) {
	const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'ovis-demo-restore-'));
	const binDir = path.join(tempDir, 'bin');
	const backupDir = path.join(tempDir, 'backups/snapshot/onc_test');
	const capturePath = path.join(tempDir, 'mongo-eval.txt');

	try {
		await fsPromises.mkdir(binDir);
		await fsPromises.mkdir(backupDir, { recursive: true });
		await fsPromises.writeFile(path.join(backupDir, 'user.bson'), '');
		await fsPromises.writeFile(
			path.join(binDir, 'mongosh'),
			`#!/bin/sh
case "$*" in
  *adminCommand*) printf '1\\n' ;;
  *)
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--eval" ]; then
        shift
        printf '%s\\n__OVIS_EVAL_END__\\n' "$1" >> "$CAPTURE_PATH"
        break
      fi
      shift
    done
    printf '0\\n'
    ;;
esac
`,
			{ mode: 0o755 }
		);
		await fsPromises.writeFile(path.join(binDir, 'mongorestore'), '#!/bin/sh\nexit 0\n', {
			mode: 0o755
		});

		const env = {
			...process.env,
			BACKUP_ROOT: path.join(tempDir, 'backups'),
			CAPTURE_PATH: capturePath,
			OVIS_IMPORT_MODE: importMode,
			PATH: `${binDir}:${process.env.PATH}`
		};
		if (ignoreIds === undefined) {
			delete env.MONGO_RESTORE_IGNORE_IDS;
		} else {
			env.MONGO_RESTORE_IGNORE_IDS = ignoreIds;
		}

		const result = spawnSync('bash', [mongoRestorePath], {
			encoding: 'utf8',
			env
		});

		assert.equal(result.status, 0, result.stderr || result.stdout);
		return await fsPromises.readFile(capturePath, 'utf8');
	} finally {
		await fsPromises.rm(tempDir, { recursive: true, force: true });
	}
}

function applyMongoEvals(mongoEvals, initialUser) {
	let storedUser = initialUser === undefined ? undefined : structuredClone(initialUser);
	const collection = {
		countDocuments() {
			return storedUser === undefined ? 0 : 1;
		},
		updateOne(filter, update, options) {
			const matches =
				storedUser !== undefined &&
				Object.entries(filter).every(([key, value]) => storedUser[key] === value);
			if (!matches && storedUser === undefined && options?.upsert === true) {
				storedUser = structuredClone(update.$setOnInsert);
			} else if (matches && update.$set !== undefined) {
				Object.assign(storedUser, structuredClone(update.$set));
			}
		}
	};
	const database = {
		getCollection() {
			return collection;
		}
	};

	for (const script of mongoEvals.split('\n__OVIS_EVAL_END__\n').filter(Boolean)) {
		vm.runInNewContext(script, {
			Date,
			db: {
				getSiblingDB() {
					return database;
				}
			},
			print() {}
		});
	}

	return storedUser;
}

function renderCompose(composeFile, importMode) {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ovis-compose-config-'));
	const tempComposeFile = path.join(tempDir, path.basename(composeFile));

	try {
		fs.copyFileSync(path.join(repositoryRoot, composeFile), tempComposeFile);
		fs.writeFileSync(path.join(tempDir, '.env'), '', 'utf8');

		const result = spawnSync(
			'docker',
			['compose', '-f', tempComposeFile, 'config', '--format', 'json'],
			{
				cwd: tempDir,
				encoding: 'utf8',
				env: {
					...process.env,
					APP_DOMAIN: 'localhost',
					KEYCLOAK_ADMIN: 'admin',
					KEYCLOAK_ADMIN_PASSWORD: 'admin',
					KEYCLOAK_CLIENT_SECRET: 'client-secret',
					KEYCLOAK_PORT: '8180',
					NGINX_HTTP_PORT: '8080',
					NGINX_HTTPS_PORT: '8443',
					NGINX_PROXY_MODE: 'true',
					NGINX_SSL_ENABLED: 'false',
					OVIS_IMPORT_MODE: importMode,
					POSTGRES_PASSWORD: 'postgres'
				}
			}
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
		return JSON.parse(result.stdout);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

test('seeds the hardcoded test identity when import mode is DEMO', async () => {
	// Given
	const realm = await buildRealm('DEMO');

	// When
	const demoUser = realm.users.find((user) => user.username === 'test');

	// Then
	assert.equal(demoUser?.enabled, true);
	assert.deepEqual(demoUser?.credentials, [{ type: 'password', value: 'test', temporary: false }]);
});

test('does not seed the hardcoded test identity outside DEMO mode', async () => {
	// Given
	const realm = await buildRealm('ONKOSTAR');

	// When
	const usernames = realm.users.map((user) => user.username);

	// Then
	assert.equal(usernames.includes('test'), false);
	assert.equal(usernames.includes('ovis-root'), true);
});

test('leaves recurring DEMO user creation to the post-restore bootstrap', () => {
	// Given
	const users = runMongoInit('DEMO');

	// Then
	assert.deepEqual(
		users.map((user) => user._id),
		['ovis-root']
	);
});

test('does not seed the test OVIS user outside DEMO mode', () => {
	// Given
	const users = runMongoInit('ONKOSTAR');

	// When
	const userIds = users.map((user) => user._id);

	// Then
	assert.deepEqual(userIds, ['ovis-root']);
});

test('does not ignore a pre-existing test user when deciding a DEMO restore', async () => {
	// Given
	const mongoEval = await runMongoRestore('DEMO');

	// When
	const ignoreIds = mongoEval.match(/const ignoreIds = (.+);/)?.[1];

	// Then
	assert.equal(ignoreIds, '["ovis-root"]');
});

test('removes an explicitly configured test user from the DEMO restore ignore list', async () => {
	// Given
	const mongoEval = await runMongoRestore('DEMO', 'ovis-root,test');

	// When
	const ignoreIds = mongoEval.match(/const ignoreIds = (.+);/)?.[1];

	// Then
	assert.equal(ignoreIds, '["ovis-root"]');
});

test('ignores only the root user when deciding a non-DEMO restore', async () => {
	// Given
	const mongoEval = await runMongoRestore('ONKOSTAR');

	// When
	const ignoreIds = mongoEval.match(/const ignoreIds = (.+);/)?.[1];

	// Then
	assert.equal(ignoreIds, '["ovis-root"]');
});

test('creates a missing active regular OVIS test user during every DEMO restore bootstrap', async () => {
	// Given
	const mongoEval = await runMongoRestore('DEMO');

	// When
	const user = applyMongoEvals(mongoEval);

	// Then
	assert.equal(user?._id, 'test');
	assert.equal(user?.status, 'active');
	assert.equal(user?.role, 'user');
});

test('preserves an existing manually created OVIS test user during DEMO bootstrap', async () => {
	// Given
	const manualUser = {
		_id: 'test',
		createdBy: 'manual-admin',
		role: 'user',
		status: 'inactive',
		manualSentinel: 'keep-me'
	};
	const mongoEval = await runMongoRestore('DEMO');

	// When
	const user = applyMongoEvals(mongoEval, manualUser);

	// Then
	assert.deepEqual(user, manualUser);
});

test('demotes a legacy system-seeded OVIS test user to a regular user during DEMO bootstrap', async () => {
	// Given
	const legacyUser = {
		_id: 'test',
		createdBy: 'system',
		role: 'super-admin',
		status: 'active',
		legacySentinel: 'keep-me'
	};
	const mongoEval = await runMongoRestore('DEMO');

	// When
	const user = applyMongoEvals(mongoEval, legacyUser);

	// Then
	assert.deepEqual(user, { ...legacyUser, role: 'user' });
});

test('does not create the OVIS test user outside DEMO mode', async () => {
	// Given
	const mongoEval = await runMongoRestore('ONKOSTAR');

	// When
	const user = applyMongoEvals(mongoEval);

	// Then
	assert.equal(user, undefined);
});

for (const composeFile of ['compose.yaml', 'compose-image.yaml']) {
	test(`${composeFile} passes import mode to identity stores`, () => {
		// Given
		const config = renderCompose(composeFile, 'CREDOS');

		// When
		const keycloakMode = config.services.keycloak.environment.OVIS_IMPORT_MODE;
		const mongoMode = config.services['ovis-backend-database-mongodb'].environment.OVIS_IMPORT_MODE;
		const restoreMode = config.services['mongodb-restore'].environment.OVIS_IMPORT_MODE;

		// Then
		assert.equal(keycloakMode, 'CREDOS');
		assert.equal(mongoMode, 'CREDOS');
		assert.equal(restoreMode, 'CREDOS');
	});
}
