import { createPool } from 'mariadb';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// UTMS_TUM.mjs
//  - Reads UTMS/3CT exports from a folder (6 txt files) and merges "study" into omock.json
//  - File format: first line header with "$" delimiter, following lines data rows (also "$" delimited)
//
// Expected filenames (in baseDir; default: /shared):
//   - 3ctstudie.txt
//   - 3ctstud_pat.txt
//   - 3ctutms_pat.txt
//   - 3ctstud_org.txt
//   - 3ctorganisa.txt
//   - 3ctstuzusan.txt
//
// Output:
//   - writes /shared/3ctStudy.txt (or alongside outTxtPath) as `"study": [...],\n`
//   - writes merged omock.json

const SITE = 'TUM';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_BASEDIR = process.env.STUDY_TUM_DIR || path.join(__dirname, 'UTMSData');
const DEFAULT_OUT_TXT = '/shared/out.txt';
const DEFAULT_OMOCK = '/shared/omock.json';
const DEFAULT_STUDY_TXT = '/shared/3ctStudy.txt';

// ONKOSTAR pool (for patient ID filtering)
const onk = createPool({
	host: process.env.ONKOSTAR_DB_HOST,
	port: parseInt(process.env.ONKOSTAR_DB_PORT || '3306'),
	user: process.env.ONKOSTAR_DB_USER,
	password: process.env.ONKOSTAR_DB_PASSWORD,
	database: 'onkostar',
	connectionLimit: 5
});

let onkPoolClosed = false;

async function closeOnkPool() {
	if (onkPoolClosed) return;
	onkPoolClosed = true;
	console.log(`[${SITE}] Closing ONKOSTAR database pool...`);
	await onk.end();
	console.log(`[${SITE}] ONKOSTAR database pool closed.`);
}

async function fetchOnkoConn() {
	const conn = await onk.getConnection();
	console.log(`[${SITE}] ONKOSTAR Total connections: `, onk.totalConnections());
	console.log(`[${SITE}] ONKOSTAR Active connections: `, onk.activeConnections());
	console.log(`[${SITE}] ONKOSTAR Idle connections: `, onk.idleConnections());
	return conn;
}

function splitPreserveTrailing(line, sep, expectedLen) {
	const parts = line.split(sep);
	// String.prototype.split drops trailing empties. Re-pad to header length.
	while (parts.length < expectedLen) parts.push('');
	return parts;
}

async function readDollarFile(filePath) {
	const raw = await fs.readFile(filePath, 'utf8');
	const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
	if (!lines.length) return [];
	const header = lines[0].trim().split('$');
	const out = [];
	for (let i = 1; i < lines.length; i++) {
		const row = splitPreserveTrailing(lines[i], '$', header.length);
		const obj = {};
		for (let c = 0; c < header.length; c++) obj[header[c]] = row[c] ?? '';
		out.push(obj);
	}
	return out;
}

function stripTrailingComma(s) {
	return s.replace(/,\s*$/s, '');
}

function norm(s) {
	return (s ?? '').toString().trim();
}

/**
 * Build study array in the same shape as the LMU SQL variant:
 *  {
 *    studyID, shortname, type, start, phase, status, eudract, firstPatInPlanned,
 *    organisationFull, organisationShort,
 *    studyPatients: [{ recruitmentDate, patID }, ...]
 *  }
 */
async function buildStudyRows({ baseDir, diagPatIdSet }) {
	const f = (name) => path.join(baseDir, name);

	const [studie, stud_pat, utms_pat, stud_org, organisa, stuzusan] = await Promise.all([
		readDollarFile(f('3ctstudie.txt')),
		readDollarFile(f('3ctstud_pat.txt')),
		readDollarFile(f('3ctutms_pat.txt')),
		readDollarFile(f('3ctstud_org.txt')),
		readDollarFile(f('3ctorganisa.txt')),
		readDollarFile(f('3ctstuzusan.txt'))
	]);

	// Map UTMS_PATID -> PATNR
	const utmsPatIdToPatnr = new Map();
	for (const r of utms_pat) {
		const utmsId = norm(r.UTMS_PATID);
		if (!utmsId) continue;
		utmsPatIdToPatnr.set(utmsId, norm(r.PATNR));
	}

	// Studien ohne Freigabe (wie LMU: zusatzangabe / zusatz_wert)
	const blockedStudies = new Set(
		stuzusan
			.filter(
				(r) =>
					norm(r.ZUSATZANGABE) === 'Keine Freigabe ö.Reg' &&
					norm(r.ZUSATZ_WERT) === 'Keine Freigabe'
			)
			.map((r) => norm(r.OBJEKT_ID))
			.filter(Boolean)
	);

	// Organisation lookup (UTMS_ORGID -> {orgname, ish_orgid})
	const orgByUtmsOrgId = new Map();
	for (const r of organisa) {
		const id = norm(r.UTMS_ORGID);
		if (!id) continue;
		orgByUtmsOrgId.set(id, {
			orgname: norm(r.ORGNAME),
			ish_orgid: norm(r.ISH_ORGID)
		});
	}

	// Studie -> first matching "F" org entry (as in SQL: AND og.OE_ART = "F")
	const orgByStudyId = new Map();
	for (const r of stud_org) {
		if (norm(r.OE_ART) !== 'F') continue;
		const sid = norm(r.STUDIEN_ID);
		const utmsOrgId = norm(r.UTMS_ORGID);
		if (!sid || !utmsOrgId) continue;
		if (!orgByStudyId.has(sid)) orgByStudyId.set(sid, utmsOrgId);
	}

	// Study patients aggregate: studyID -> [{ recruitmentDate, patID }]
	const patsByStudy = new Map();
	for (const r of stud_pat) {
		const sid = norm(r.STUDIEN_ID);
		if (!sid) continue;

		const utmsPatId = norm(r.UTMS_PATID);
		const patnr = utmsPatIdToPatnr.get(utmsPatId) || '';
		if (!patnr) continue;

		// Filter to ONKOSTAR cohort
		if (!diagPatIdSet.has(patnr)) continue;

		const recDate = norm(r.BEGINN);
		const arr = patsByStudy.get(sid) || [];
		arr.push({ recruitmentDate: recDate, patID: patnr });
		patsByStudy.set(sid, arr);
	}

	// Build final rows from 3ctstudie, but only those with at least 1 patient and not blocked
	const rows = [];
	for (const st of studie) {
		const sid = norm(st.STUDIEN_ID);
		if (!sid) continue;
		if (blockedStudies.has(sid)) continue;

		const studyPatients = patsByStudy.get(sid);
		if (!studyPatients || !studyPatients.length) continue;

		const utmsOrgId = orgByStudyId.get(sid);
		const org = utmsOrgId ? orgByUtmsOrgId.get(utmsOrgId) : null;

		rows.push({
			studyID: sid,
			shortname: norm(st.STUDKN),
			type: norm(st.STUDIENART),
			start: norm(st.STUDBEG),
			phase: norm(st.SPHASE),
			status: norm(st.STU_STATUS),
			eudract: norm(st.EUDRACT_NR),
			firstPatInPlanned: norm(st.FIRST_PAT_IN_PLAN),
			organisationFull: org?.orgname || '',
			organisationShort: org?.ish_orgid || '',
			studyPatients
		});
	}

	return rows;
}

async function getDiagPatIdSet() {
	const oncon = await fetchOnkoConn();
	try {
		const diagpatIDs = await oncon.query(
			'select JSON_arrayagg(distinct patienten_id) as pids from dk_diagnose LEFT JOIN prozedur ON dk_diagnose.id = prozedur.id LEFT JOIN erkrankung_prozedur ep ON prozedur.id = ep.prozedur_id  LEFT JOIN patient ON prozedur.patient_id = patient.id;'
		);
		const pids = diagpatIDs?.[0]?.pids;
		if (!pids?.length) {
			throw new Error(`[${SITE}] Keine patienten_id aus ONKOSTAR gefunden (dk_diagnose).`);
		}
		// pids can come as JSON string or array depending on driver settings
		const arr = Array.isArray(pids) ? pids : JSON.parse(pids);
		return new Set(arr.map((x) => x?.toString()).filter(Boolean));
	} finally {
		console.log(`[${SITE}] Releasing ONKOSTAR database connection...`);
		await oncon.release();
		console.log(`[${SITE}] ONKOSTAR database connection released.`);
	}
}

async function writeStudyTxt(studyRows, studyTxtPath = DEFAULT_STUDY_TXT) {
	const out = `"study": ` + JSON.stringify(studyRows, null, 2) + ',\n';
	await fs.writeFile(studyTxtPath, out, { flag: 'w+' });
	console.log(`[${SITE}] ${path.basename(studyTxtPath)} wurde geschrieben.`);
}

async function mergeOutAndStudy({ outTxtPath, studyTxtPath, omockPath }) {
	const [patientRaw, studyRaw] = await Promise.all([
		fs.readFile(outTxtPath, 'utf8').catch(() => ''),
		fs.readFile(studyTxtPath, 'utf8').catch(() => '')
	]);

	const patient = stripTrailingComma(patientRaw.trim());
	const study = stripTrailingComma(studyRaw.trim());

	let inner = '';
	if (patient) inner += patient;
	if (study) inner += (inner ? ',\n' : '') + study;

	await fs.writeFile(omockPath, `\n{\n${inner}\n}\n`, 'utf8');
	console.log(`[${SITE}] omock.json wurde erfolgreich erstellt/aktualisiert.`);
}

async function appendStudyToOmock({ studyTxtPath, omockPath, hasExistingEntries = false }) {
	const studyRaw = await fs.readFile(studyTxtPath, 'utf8').catch(() => '');
	const study = stripTrailingComma(studyRaw.trim());
	if (!study) {
		console.log(`[${SITE}] Keine Study-Daten zum Anhängen gefunden.`);
		return false;
	}

	await fs.writeFile(omockPath, `${hasExistingEntries ? ',\n' : ''}${study}`, { flag: 'a' });
	console.log(`[${SITE}] Study-Daten wurden an omock.json angehängt.`);
	return true;
}

/**
 * Exported API (so mdbConnect.mjs can call it optionally).
 */
export async function run3ctAndMerge({
	baseDir = DEFAULT_BASEDIR,
	outTxtPath = DEFAULT_OUT_TXT,
	omockPath = DEFAULT_OMOCK,
	studyTxtPath = DEFAULT_STUDY_TXT,
	appendToExistingOmock = false,
	hasExistingEntries = false
} = {}) {
	try {
		const diagPatIdSet = await getDiagPatIdSet();
		const rows = await buildStudyRows({ baseDir, diagPatIdSet });
		await writeStudyTxt(rows, studyTxtPath);
		if (appendToExistingOmock) {
			const appended = await appendStudyToOmock({ studyTxtPath, omockPath, hasExistingEntries });
			return { appended };
		}
		await mergeOutAndStudy({ outTxtPath, studyTxtPath, omockPath });
		return { appended: false };
	} finally {
		await closeOnkPool();
	}
}

// Standalone execution (optional)
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	try {
		await fs.rm(DEFAULT_STUDY_TXT, { force: true });
		await run3ctAndMerge();
		console.log(`[${SITE}] Programm erfolgreich beendet.`);
	} catch (err) {
		console.error(`[${SITE}] Fehler aufgetreten:`, err);
		process.exitCode = 1;
	} finally {
		await closeOnkPool();
	}
}
