// UTMS_ULM.mjs
// Baut die omock-Collection "study" aus einem UTMS/3CT-Dateiexport für CREDOS/Ulm.
//
// Erwarteter Ordner, Default im Docker:
//   /input/UTMSExportFiles
//
// Erwartete Dateien:
//   - 3ctstudie.txt
//   - 3ctstud_pat.txt
//   - 3ctutms_pat.txt
//   - 3ctstud_org.txt
//   - 3ctorganisa.txt
//
// Anders als LMU/TUM:
//   - keine ONKOSTAR-DB-Verbindung
//   - keine Freigabe-Einschränkung über 3ctstuzusan.txt
//   - Filterung gegen die bereits importierten CREDOS-Patienten
//   - führende Nullen in Patientennummern werden beim Matching ignoriert

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SITE = "Ulm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_BASEDIR =
  process.env.STUDY_ULM_DIR ||
  "/input/UTMSExportFiles" ||
  path.join(__dirname, "UTMSExportFiles");

function splitPreserveTrailing(line, sep, expectedLen) {
  const parts = line.split(sep);

  while (parts.length < expectedLen) {
    parts.push("");
  }

  return parts;
}

async function readDollarFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const header = lines[0].trim().split("$");
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitPreserveTrailing(lines[i], "$", header.length);
    const row = {};

    for (let c = 0; c < header.length; c += 1) {
      row[header[c]] = values[c] ?? "";
    }

    rows.push(row);
  }

  return rows;
}

function norm(value) {
  return (value ?? "").toString().trim();
}

function normalizePatientIdForMatching(value) {
  const normalized = norm(value);

  if (!normalized) {
    return "";
  }

  /**
   * UTMS und CREDOS können bei PATNR/patID unterschiedlich mit führenden Nullen umgehen.
   * Beispiel: 000123 und 123 sollen matchen.
   * Wenn die ID ausschließlich aus Nullen besteht, bleibt eine einzelne 0 übrig.
   */
  const withoutLeadingZeros = normalized.replace(/^0+/, "");

  return withoutLeadingZeros || "0";
}

function createValidPatientLookup(validPatients = []) {
  const lookup = new Map();

  for (const patient of validPatients) {
    const originalPatId = norm(patient?.patID);

    if (!originalPatId) {
      continue;
    }

    /**
     * Exaktes Matching und Matching ohne führende Nullen erlauben.
     * In der Ausgabe verwenden wir weiterhin die patID aus der omock-Patienten-Collection.
     */
    lookup.set(originalPatId, originalPatId);
    lookup.set(normalizePatientIdForMatching(originalPatId), originalPatId);
  }

  return lookup;
}

function resolveValidPatId(rawPatId, validPatientLookup) {
  const exact = norm(rawPatId);

  if (!exact) {
    return null;
  }

  return (
    validPatientLookup.get(exact) ??
    validPatientLookup.get(normalizePatientIdForMatching(exact)) ??
    null
  );
}

/**
 * Baut study-Objekte in derselben Zielstruktur wie die vorhandene LMU/TUM-Variante:
 * {
 *   studyID,
 *   shortname,
 *   type,
 *   start,
 *   phase,
 *   status,
 *   eudract,
 *   firstPatInPlanned,
 *   organisationFull,
 *   organisationShort,
 *   studyPatients: [{ recruitmentDate, patID }]
 * }
 */
export async function buildStudiesForUlm({
  validPatients = [],
  baseDir = DEFAULT_BASEDIR
} = {}) {
  const file = filename => path.join(baseDir, filename);

  console.log(`[${SITE}] UTMS Import nutzt Export-Ordner: ${baseDir}`);

  const [studieRows, studPatRows, utmsPatRows, studOrgRows, organisaRows] = await Promise.all([
    readDollarFile(file("3ctstudie.txt")),
    readDollarFile(file("3ctstud_pat.txt")),
    readDollarFile(file("3ctutms_pat.txt")),
    readDollarFile(file("3ctstud_org.txt")),
    readDollarFile(file("3ctorganisa.txt"))
  ]);

  const validPatientLookup = createValidPatientLookup(validPatients);

  /**
   * UTMS_PATID -> PATNR.
   */
  const utmsPatIdToPatnr = new Map();

  for (const row of utmsPatRows) {
    const utmsPatId = norm(row.UTMS_PATID);

    if (!utmsPatId) {
      continue;
    }

    utmsPatIdToPatnr.set(utmsPatId, norm(row.PATNR));
  }

  /**
   * Organisation lookup: UTMS_ORGID -> Organisation.
   */
  const orgByUtmsOrgId = new Map();

  for (const row of organisaRows) {
    const utmsOrgId = norm(row.UTMS_ORGID);

    if (!utmsOrgId) {
      continue;
    }

    orgByUtmsOrgId.set(utmsOrgId, {
      orgname: norm(row.ORGNAME),
      ishOrgId: norm(row.ISH_ORGID)
    });
  }

  /**
   * Studie -> erste Organisation mit OE_ART = F.
   * Das entspricht der TUM/LMU-Logik.
   */
  const orgIdByStudyId = new Map();

  for (const row of studOrgRows) {
    if (norm(row.OE_ART) !== "F") {
      continue;
    }

    const studyId = norm(row.STUDIEN_ID);
    const utmsOrgId = norm(row.UTMS_ORGID);

    if (!studyId || !utmsOrgId) {
      continue;
    }

    if (!orgIdByStudyId.has(studyId)) {
      orgIdByStudyId.set(studyId, utmsOrgId);
    }
  }

  /**
   * Studie -> Patientenzuordnungen.
   * Wichtig: Nur Patient:innen übernehmen, die auch in der CREDOS-patient-Collection sind.
   */
  const studyPatientsByStudyId = new Map();

  for (const row of studPatRows) {
    const studyId = norm(row.STUDIEN_ID);

    if (!studyId) {
      continue;
    }

    const utmsPatId = norm(row.UTMS_PATID);
    const rawPatNr = utmsPatIdToPatnr.get(utmsPatId) ?? "";
    const omockPatId = resolveValidPatId(rawPatNr, validPatientLookup);

    if (!omockPatId) {
      continue;
    }

    const studyPatients = studyPatientsByStudyId.get(studyId) ?? [];

    studyPatients.push({
      recruitmentDate: norm(row.BEGINN),
      patID: omockPatId
    });

    studyPatientsByStudyId.set(studyId, studyPatients);
  }

  const studies = [];

  for (const studyRow of studieRows) {
    const studyId = norm(studyRow.STUDIEN_ID);

    if (!studyId) {
      continue;
    }

    const studyPatients = studyPatientsByStudyId.get(studyId);

    if (!studyPatients || studyPatients.length === 0) {
      continue;
    }

    const orgId = orgIdByStudyId.get(studyId);
    const organisation = orgId ? orgByUtmsOrgId.get(orgId) : null;

    studies.push({
      studyID: studyId,
      shortname: norm(studyRow.STUDKN),
      type: norm(studyRow.STUDIENART),
      start: norm(studyRow.STUDBEG),
      phase: norm(studyRow.SPHASE),
      status: norm(studyRow.STU_STATUS),
      eudract: norm(studyRow.EUDRACT_NR),
      firstPatInPlanned: norm(studyRow.FIRST_PAT_IN_PLAN),
      organisationFull: organisation?.orgname ?? "",
      organisationShort: organisation?.ishOrgId ?? "",
      env: SITE,
      studyPatients
    });
  }

  console.log(`[${SITE}] Studien geschrieben: ${studies.length}`);
  console.log(`[${SITE}] 3ctstudie roh: ${studieRows.length}`);
  console.log(`[${SITE}] 3ctstud_pat roh: ${studPatRows.length}`);
  console.log(`[${SITE}] 3ctutms_pat roh: ${utmsPatRows.length}`);
  console.log(`[${SITE}] 3ctstud_org roh: ${studOrgRows.length}`);
  console.log(`[${SITE}] 3ctorganisa roh: ${organisaRows.length}`);

  return studies;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  buildStudiesForUlm()
    .then(studies => {
      console.log(JSON.stringify({ study: studies }, null, 2));
    })
    .catch(error => {
      console.error(`[${SITE}] UTMS Import fehlgeschlagen:`);
      console.error(error);
      process.exit(1);
    });
}
