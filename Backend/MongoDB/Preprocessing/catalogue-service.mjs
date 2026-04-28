import http from 'node:http';
import net from 'node:net';
import { createWriteStream, existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const PORT = Number(process.env.CATALOGUE_SERVICE_PORT || process.env.PREPROCESSOR_PORT || 9000);
const HOST = process.env.CATALOGUE_SERVICE_HOST || '0.0.0.0';

const OMOCK_PATH = process.env.OMOCK_PATH
	? path.resolve(process.env.OMOCK_PATH)
	: path.resolve('Preprocessing/omock.json');

const QUEUED_OMOCK_PATH = `${OMOCK_PATH}.queued`;

const CATALOGUE_PATH = process.env.CATALOGUE_PATH
	? path.resolve(process.env.CATALOGUE_PATH)
	: path.resolve('ovis-catalogue.json');

const noCacheHeaders = {
	'Cache-Control': 'no-cache, no-store, must-revalidate',
	Pragma: 'no-cache',
	Expires: '0'
};

const state = {
	status: 'waiting', // waiting | uploading | uploaded | processing | ready | error
	lastUploadAt: null,
	lastProcessedAt: null,
	lastError: null
};

let processingPromise = null;
let retryTimer = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseMongoAddress() {
	const raw =
		process.env.ADDRESS || process.env.MONGO_URL || 'mongodb://ovis-backend-database-mongodb:27017';
	try {
		const url = new URL(raw);
		const host = url.hostname || 'localhost';
		const port = Number(url.port || 27017);
		return { host, port, raw };
	} catch {
		const cleaned = raw.replace(/^mongodb(\+srv)?:\/\//, '');
		const hostPort = cleaned.split('/')[0]?.split(',')[0] || 'ovis-backend-database-mongodb:27017';
		const [host, portStr] = hostPort.split(':');
		return { host: host || 'ovis-backend-database-mongodb', port: Number(portStr || 27017), raw };
	}
}

function canConnect(host, port, timeoutMs = 1000) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		let finished = false;
		const done = (ok) => {
			if (finished) return;
			finished = true;
			socket.destroy();
			resolve(ok);
		};

		socket.setTimeout(timeoutMs);
		socket.once('error', () => done(false));
		socket.once('timeout', () => done(false));
		socket.connect(port, host, () => done(true));
	});
}

async function waitForMongoReady() {
	const { host, port, raw } = parseMongoAddress();
	const timeoutMs = Number(process.env.MONGO_WAIT_TIMEOUT_MS || 60000);
	const intervalMs = Number(process.env.MONGO_WAIT_INTERVAL_MS || 2000);
	const start = Date.now();

	while (true) {
		const ok = await canConnect(host, port);
		if (ok) return;
		if (Date.now() - start >= timeoutMs) {
			throw new Error(`MongoDB not reachable at ${host}:${port} (${raw}) after ${timeoutMs}ms`);
		}
		await sleep(intervalMs);
	}
}

function scheduleRetry(reason) {
	if (retryTimer) return;
	const delayMs = Number(process.env.PROCESS_RETRY_SECONDS || 5) * 1000;
	console.warn(`[catalogue-service] Scheduling retry in ${delayMs}ms: ${reason}`);
	retryTimer = setTimeout(() => {
		retryTimer = null;
		if (existsSync(OMOCK_PATH)) {
			void processOmock();
		}
	}, delayMs);
}

function sendJson(res, statusCode, body, headers = {}) {
	const payload = JSON.stringify(body);
	res.writeHead(statusCode, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': Buffer.byteLength(payload),
		...noCacheHeaders,
		...headers
	});
	res.end(payload);
}

async function safeStat(filePath) {
	try {
		return await fs.stat(filePath);
	} catch {
		return null;
	}
}

async function runNode(scriptPath, args = []) {
	return new Promise((resolve, reject) => {
		const child = spawn('node', [scriptPath, ...args], {
			stdio: ['ignore', 'inherit', 'inherit'],
			env: process.env,
			cwd: process.cwd()
		});

		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Command failed: node ${scriptPath} (exit ${code})`));
		});
	});
}

async function processOmock() {
	if (processingPromise) return processingPromise;

	processingPromise = (async () => {
		state.status = 'processing';
		state.lastError = null;
		console.log(`[catalogue-service] Processing started. Input=${OMOCK_PATH}`);

		const omockStat = await safeStat(OMOCK_PATH);
		if (!omockStat) {
			throw new Error(`Cannot process: omock.json not found at ${OMOCK_PATH}`);
		}

		await waitForMongoReady();

		// 1) Load & transform into MongoDB
		await runNode('./Preprocessing/preprocessor.mjs');

		// 2) Generate catalogue JSON from MongoDB
		await runNode('./createCatalog.mjs');

		const catStat = await safeStat(CATALOGUE_PATH);
		if (!catStat) {
			throw new Error(`Catalogue generation finished, but ${CATALOGUE_PATH} not found`);
		}

		state.status = 'ready';
		state.lastProcessedAt = catStat.mtime.getTime();
		console.log(
			`[catalogue-service] Processing complete. Catalogue size=${
				catStat.size
			} bytes, mtime=${catStat.mtime.toISOString()}`
		);
	})()
		.catch((err) => {
			state.status = 'error';
			state.lastError = err?.message ?? String(err);
			console.error('[catalogue-service] Processing failed:', err);
			if (existsSync(OMOCK_PATH)) {
				scheduleRetry(state.lastError || 'unknown error');
			}
		})
		.finally(() => {
			processingPromise = null;

			// If an upload came in while we were processing, process it next.
			// This avoids rejecting uploads with 409 and keeps data-import containers simple.
			void (async () => {
				const queued = await safeStat(QUEUED_OMOCK_PATH);
				if (!queued) return;

				try {
					console.log('[catalogue-service] Detected queued upload; promoting and re-processing');
					await fs.rename(QUEUED_OMOCK_PATH, OMOCK_PATH);
					void processOmock();
				} catch (err) {
					state.status = 'error';
					state.lastError = err?.message ?? String(err);
					console.error('[catalogue-service] Failed to promote queued upload:', err);
				}
			})();
		});

	return processingPromise;
}

async function serveCatalogue(res) {
	const stats = await safeStat(CATALOGUE_PATH);
	if (!stats) {
		return sendJson(
			res,
			404,
			{
				error: 'Catalogue not available',
				message: `File not found: ${CATALOGUE_PATH}`,
				state
			},
			{}
		);
	}

	const raw = await fs.readFile(CATALOGUE_PATH, 'utf-8');
	const parsed = JSON.parse(raw);

	return sendJson(
		res,
		200,
		{
			source: 'preprocessing',
			timestamp: stats.mtime.getTime(),
			size: stats.size,
			data: parsed
		},
		{
			ETag: `"${stats.mtime.getTime()}-${stats.size}"`,
			'Last-Modified': stats.mtime.toUTCString()
		}
	);
}

async function handleUpload(req, res) {
	const isBusy = state.status === 'processing';

	// Ensure parent directory exists
	await fs.mkdir(path.dirname(OMOCK_PATH), { recursive: true });

	if (!isBusy) state.status = 'uploading';
	state.lastError = null;

	const targetPath = isBusy ? QUEUED_OMOCK_PATH : OMOCK_PATH;
	const tmpPath = `${targetPath}.uploading`;
	let bytes = 0;

	await new Promise((resolve, reject) => {
		const ws = createWriteStream(tmpPath);

		req.on('data', (chunk) => {
			bytes += chunk.length;
		});

		req.on('error', reject);
		ws.on('error', reject);

		ws.on('finish', resolve);
		req.pipe(ws);
	});

	await fs.rename(tmpPath, targetPath);
	if (!isBusy) state.status = 'uploaded';
	state.lastUploadAt = Date.now();

	console.log(
		`[catalogue-service] Upload complete. Bytes=${bytes} -> ${targetPath}${
			isBusy ? ' (queued)' : ''
		}`
	);

	// Kick off processing asynchronously (or leave it queued if currently processing).
	if (!isBusy) void processOmock();

	return sendJson(res, 202, { ok: true, queued: isBusy, uploadedBytes: bytes, state });
}

const server = http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

		if (req.method === 'GET' && url.pathname === '/health') {
			const catStat = await safeStat(CATALOGUE_PATH);
			const ready = state.status === 'ready' && !!catStat;
			const ok = state.status !== 'error';
			return sendJson(res, ok ? 200 : 503, {
				ok,
				ready,
				state,
				catalogue: catStat
					? { timestamp: catStat.mtime.getTime(), size: catStat.size, path: CATALOGUE_PATH }
					: null
			});
		}

		if (
			req.method === 'GET' &&
			(url.pathname === '/catalogue' || url.pathname === '/ovis-catalogue.json')
		) {
			return await serveCatalogue(res);
		}

		if (req.method === 'POST' && (url.pathname === '/omock' || url.pathname === '/omock.json')) {
			return await handleUpload(req, res);
		}

		if (req.method === 'POST' && url.pathname === '/process') {
			void processOmock();
			return sendJson(res, 202, { ok: true, state });
		}

		return sendJson(res, 404, { error: 'Not found' });
	} catch (err) {
		console.error('[catalogue-service] Request error:', err);
		return sendJson(res, 500, { error: 'Internal error', message: err?.message ?? String(err) });
	}
});

server.listen(PORT, HOST, async () => {
	console.log(`[catalogue-service] Listening on http://${HOST}:${PORT}`);
	console.log(`[catalogue-service] OMOCK_PATH=${OMOCK_PATH}`);
	console.log(`[catalogue-service] CATALOGUE_PATH=${CATALOGUE_PATH}`);

	// If omock.json is already present (e.g., container restart), try processing immediately.
	if (existsSync(OMOCK_PATH)) {
		console.log('[catalogue-service] Found existing omock.json; triggering processing');
		void processOmock();
	}
});

process.on('SIGTERM', () => {
	console.log('[catalogue-service] SIGTERM received, shutting down...');
	server.close(() => process.exit(0));
});
