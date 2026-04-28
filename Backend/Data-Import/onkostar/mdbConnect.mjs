import { createPool } from 'mariadb';
import { states } from './sqlStatements.mjs';
import fs from 'node:fs/promises';
import { argv } from 'node:process';

// Optional: für lokale Runs ohne Docker (harmlos, wenn dotenv nicht installiert ist)
try {
	await import('dotenv/config');
} catch {
	// ignore
}

const OUT_TXT = '/shared/out.txt';
const OMOCK_JSON = '/shared/omock.json';
const OMOCK_JSON_TMP = '/shared/omock.json.tmp';

const pool = createPool({
	host: process.env.ONKOSTAR_DB_HOST,
	port: parseInt(process.env.ONKOSTAR_DB_PORT || '3306', 10),
	user: process.env.ONKOSTAR_DB_USER,
	password: process.env.ONKOSTAR_DB_PASSWORD,
	database: 'onkostar',
	connectionLimit: 5
});

function normalizeStudySystem(v) {
	const x = (v ?? '').toString().trim().toUpperCase();
	if (!x) return null;
	if (x === 'LMU' || x === 'UTMS_LMU') return 'UTMS_LMU';
	if (x === 'TUM' || x === 'UTMS_TUM') return 'UTMS_TUM';
	return 'INVALID';
}

function resolveCollections(args, allKeys) {
	// args = argv.slice(2)
	// Default wie früher: ohne args => all
	if (!args.length) return allKeys;

	// "all" => all
	if (args.includes('all')) return allKeys;

	// sonst: nur die genannten Keys
	return args;
}

function stripTrailingComma(s) {
	return s.replace(/,\s*$/s, '');
}

async function runQuery(conn, key) {
	const sql = states[key];
	if (!sql) throw new Error(`Unbekannter Query-Key: ${key}`);

	const rows = await conn.query(sql);

	// identisch wie zuvor: out.txt als "key": [..], Zeilen sammeln
	const out = `"${key}": ` + JSON.stringify(rows, null, 2) + ',\n';
	await fs.writeFile(OUT_TXT, out, { flag: 'a' });

	return rows;
}

/**
 * WICHTIG: Wir schreiben die Basis-omock zuerst als .tmp,
 * damit der Preprocessor nicht zu früh losläuft.
 */
async function writeBaseOmockTmp() {
	const txt = await fs.readFile(OUT_TXT, 'utf8').catch(() => '');
	const entries = stripTrailingComma(txt.trim());
	const body = entries ? `\n{\n${entries}\n}\n` : `\n{}\n`;
	await fs.writeFile(OMOCK_JSON_TMP, body, 'utf8');
	console.log('omock.json.tmp erstellt (ohne UTMS).');
}

/**
 * Optional: UTMS merge, schreibt ebenfalls in die .tmp Datei.
 */
async function maybeMergeUtmsIntoTmp() {
	const utms = normalizeStudySystem(process.env.STUDY_SYSTEM);
	if (!utms) return;

	if (utms === 'INVALID') {
		console.warn(
			`WARN: STUDY_SYSTEM='${process.env.STUDY_SYSTEM}' ungültig (erlaubt: '', LMU, TUM). UTMS deaktiviert.`
		);
		return;
	}

	const modPath = utms === 'UTMS_TUM' ? './UTMS_TUM.mjs' : './UTMS_LMU.mjs';
	const mod = await import(modPath);

	if (typeof mod.run3ctAndMerge !== 'function') {
		throw new Error(
			`${modPath} exportiert keine Funktion run3ctAndMerge({outTxtPath, omockPath}).`
		);
	}

	await mod.run3ctAndMerge({ outTxtPath: OUT_TXT, omockPath: OMOCK_JSON_TMP });
	console.log(`omock.json.tmp um ${utms} Study-Daten ergänzt.`);
}

/**
 * Atomisches Finalisieren: erst hier wird /shared/omock.json "sichtbar".
 */
async function finalizeOmock() {
	await fs.rm(OMOCK_JSON, { force: true });
	await fs.rename(OMOCK_JSON_TMP, OMOCK_JSON);
	console.log('omock.json final geschrieben.');
}

async function main() {
	const allKeys = Object.keys(states);

	// Collections bestimmen (wie früher)
	const args = argv.slice(2);
	const cols = resolveCollections(args, allKeys);

	// Cleanup
	await fs.rm(OUT_TXT, { force: true });
	await fs.rm(OMOCK_JSON_TMP, { force: true });

	let conn;
	try {
		conn = await pool.getConnection();

		for (const key of cols) {
			const rows = await runQuery(conn, key);
			console.dir(rows, { depth: null });
		}
	} finally {
		if (conn) conn.end();
	}

	// 1) IMMER Basis-omock als TMP erzeugen
	await writeBaseOmockTmp();

	// 2) Optional: UTMS merge in TMP
	await maybeMergeUtmsIntoTmp();

	// 3) Atomisch finalisieren (Preprocessor sieht erst jetzt omock.json)
	await finalizeOmock();
}

try {
	await main();
	console.log('Programm erfolgreich beendet.');
} catch (err) {
	console.error('Fehler aufgetreten:', err);
	process.exitCode = 1;
} finally {
	await pool.end();
}
