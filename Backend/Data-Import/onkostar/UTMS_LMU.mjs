import { createPool } from 'mariadb';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// UTMS_LMU.mjs
//  - exports: run3ctAndMerge({ outTxtPath, omockPath })
//  - can also be executed directly: node UTMS_LMU.mjs

const SITE = 'LMU';
const DEFAULT_OUT_TXT = '/shared/out.txt';
const DEFAULT_3CT_TXT = '/shared/3ctStudy.txt';
const DEFAULT_OMOCK_JSON = '/shared/omock.json';

// Initialize Pools
const onk = createPool({
	host: process.env.ONKOSTAR_DB_HOST,
	port: parseInt(process.env.ONKOSTAR_DB_PORT || '3306'),
	user: process.env.ONKOSTAR_DB_USER,
	password: process.env.ONKOSTAR_DB_PASSWORD,
	database: 'onkostar',
	connectionLimit: 5
});

const dct = createPool({
	host: process.env.DCT_DB_HOST,
	port: parseInt(process.env.DCT_DB_PORT || '3306'),
	user: process.env.DCT_DB_USER,
	password: process.env.DCT_DB_PASSWORD,
	database: process.env.DCT_DB_NAME,
	connectionLimit: 2
});

async function fetchOnkoConn() {
	const conn = await onk.getConnection();
	console.log(`[${SITE}] ONKOSTAR Total connections: `, onk.totalConnections());
	console.log(`[${SITE}] ONKOSTAR Active connections: `, onk.activeConnections());
	console.log(`[${SITE}] ONKOSTAR Idle connections: `, onk.idleConnections());
	return conn;
}

async function fetchDctConn() {
	const conn = await dct.getConnection();
	console.log(`[${SITE}] DCT Total connections: `, dct.totalConnections());
	console.log(`[${SITE}] DCT Active connections: `, dct.activeConnections());
	console.log(`[${SITE}] DCT Idle connections: `, dct.idleConnections());
	return conn;
}

function stripTrailingComma(s) {
	return s.replace(/,\s*$/s, '');
}

async function run3ctQuery(threeCtTxtPath = DEFAULT_3CT_TXT) {
	const oncon = await fetchOnkoConn();

	let diagpatIDs = await oncon.query(
		'select JSON_arrayagg(distinct patienten_id) as pids from dk_diagnose LEFT JOIN prozedur ON dk_diagnose.id = prozedur.id LEFT JOIN erkrankung_prozedur ep ON prozedur.id = ep.prozedur_id  LEFT JOIN patient ON prozedur.patient_id = patient.id;'
	);

	if (!diagpatIDs?.[0]?.pids?.length) {
		throw new Error(`[${SITE}] Keine patienten_id aus ONKOSTAR gefunden (dk_diagnose).`);
	}

	// Convert to SQL IN-list (quoted)
	diagpatIDs = "'" + diagpatIDs[0].pids.join("','") + "'";

	const sqlquery = `
  SELECT 
  st.STUDIEN_ID as studyID,
  st.STUDKN as shortname, 
  st.STUDIENART as type, 
  st.STUDBEG as start, 
  st.SPHASE as phase, 
  st.STU_STATUS as status, 
  st.EUDRACT_NR as eudract, 
  st.FIRST_PAT_IN_PLAN as firstPatInPlanned,
  ga.orgname as organisationFull,
  ga.ish_orgid as organisationShort,
  pats.studyPatients
  FROM 3ctstudie as st
  LEFT JOIN 3ctstud_org as og on st.STUDIEN_ID = og.STUDIEN_ID
  LEFT JOIN 3ctorganisa as ga on og.utms_orgid = ga.utms_orgid
  INNER JOIN (
    SELECT 
      studien_id, 
      JSON_ARRAYAGG(
        JSON_OBJECT(
          "recruitmentDate", beginn,
          "patID", patnr
        )
      ) as studyPatients
    FROM 3ctstud_pat as st
    INNER JOIN 3ctutms_pat as ut on st.utms_patid = ut.utms_patid
    where  patnr in (${diagpatIDs})
    GROUP BY studien_id
  ) as pats ON st.STUDIEN_ID = pats.studien_id
  WHERE st.STUDIEN_ID NOT IN (
    SELECT DISTINCT objekt_id
    FROM 3ctstuzusan
    WHERE zusatzangabe = "Keine Freigabe ö.Reg" AND zusatz_wert = "Keine Freigabe"
  )
  AND og.OE_ART = "F";
  `;

	const con3ct = await fetchDctConn();
	const rows = await con3ct.query(sqlquery);

	const out =
		`"study": ` +
		JSON.stringify(
			rows,
			(_key, value) => (typeof value === 'bigint' ? value.toString() : value),
			2
		) +
		',\n';

	await fs.writeFile(threeCtTxtPath, out, { flag: 'w+' });
	console.log(`[${SITE}] 3ctStudy.txt wurde geschrieben: ${threeCtTxtPath}`);
}

async function mergeJsonFiles({ outTxtPath, threeCtTxtPath, omockPath }) {
	const [patient, study] = await Promise.all([
		fs.readFile(outTxtPath, 'utf8'),
		fs.readFile(threeCtTxtPath, 'utf8')
	]);

	const patientEntries = stripTrailingComma(patient.trim());
	const studyEntries = stripTrailingComma(study.trim());

	await fs.writeFile(omockPath, `\n{\n${patientEntries},\n${studyEntries}\n}\n`, 'utf8');

	console.log(`[${SITE}] omock.json wurde erfolgreich erstellt: ${omockPath}`);
}

async function appendStudyToOmock({ threeCtTxtPath, omockPath, hasExistingEntries = false }) {
	const studyRaw = await fs.readFile(threeCtTxtPath, 'utf8').catch(() => '');
	const study = stripTrailingComma(studyRaw.trim());
	if (!study) {
		console.log(`[${SITE}] Keine Study-Daten zum Anhängen gefunden.`);
		return false;
	}

	await fs.writeFile(omockPath, `${hasExistingEntries ? ',\n' : ''}${study}`, { flag: 'a' });
	console.log(`[${SITE}] Study-Daten wurden an omock.json angehängt.`);
	return true;
}

export async function run3ctAndMerge({
	outTxtPath = DEFAULT_OUT_TXT,
	omockPath = DEFAULT_OMOCK_JSON,
	threeCtTxtPath = DEFAULT_3CT_TXT,
	appendToExistingOmock = false,
	hasExistingEntries = false
} = {}) {
	try {
		await fs.rm(threeCtTxtPath, { force: true });
		await run3ctQuery(threeCtTxtPath);
		if (appendToExistingOmock) {
			const appended = await appendStudyToOmock({
				threeCtTxtPath,
				omockPath,
				hasExistingEntries
			});
			return { appended };
		}
		await mergeJsonFiles({ outTxtPath, threeCtTxtPath, omockPath });
		return { appended: false };
	} finally {
		await onk.end();
		await dct.end();
	}
}

// Allow execution as a standalone script
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	run3ctAndMerge({
		outTxtPath: DEFAULT_OUT_TXT,
		omockPath: DEFAULT_OMOCK_JSON,
		threeCtTxtPath: DEFAULT_3CT_TXT
	}).catch((err) => {
		console.error(`[${SITE}] Fehler aufgetreten:`, err);
		process.exitCode = 1;
	});
}
