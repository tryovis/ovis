// credosImporter.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCredosDollarFile } from "./credosDollarParser.mjs";

import { mapPatient } from "./mappers/patientMapper.mjs";
import { mapDiagnosis } from "./mappers/diagnosisMapper.mjs";
import { mapTherapy } from "./mappers/therapyMapper.mjs";

import { indexBy } from "./utils/indexBy.mjs";
import { keepLatestCredosDocumentVersions } from "./utils/credosVersioning.mjs";
import { createStableNumericIdFactory } from "./utils/idFactory.mjs";
import { createDd07vLookup } from "./utils/dd07vLookup.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exportDir = process.env.CREDOS_EXPORT_DIR || path.join(__dirname, "CREDOSExportFiles");
const outputPath = process.env.CREDOS_OMOCK_OUTPUT || path.join(__dirname, "omock.json");

const sourceFiles = {
  npat: path.join(exportDir, "npat.txt"),
  tzpi: path.join(exportDir, "tzpi.txt"),

  /**
   * Ersterhebung / Diagnose:
   * - TZES = solide Tumoren
   * - TZEY = systemische Tumoren
   */
  tzes: path.join(exportDir, "tzes.txt"),
  tzey: path.join(exportDir, "tzey.txt"),

  /**
   * Verlauf:
   * - TZVS = solide Tumoren
   * - TZVY = systemische Tumoren
   */
  tzvs: path.join(exportDir, "tzvs.txt"),
  tzvy: path.join(exportDir, "tzvy.txt"),

  /**
   * Therapie:
   * - TZTH = Therapie-Hauptdatei
   */
  tzth: path.join(exportDir, "tzth.txt"),

  /**
   * Zusatzinformationen:
   * - TZTI = Organisationseinheit über Dokumentnummer
   */
  tzti: path.join(exportDir, "tzti.txt"),

  dd07v: path.join(exportDir, "dd07v.txt")
};

async function main() {
  const dd07vLookup = await createDd07vLookup(sourceFiles.dd07v);

  const npatRows = await parseCredosDollarFile(sourceFiles.npat);

  const rawTzpiRows = await parseCredosDollarFile(sourceFiles.tzpi);
  const tzpiRows = keepLatestCredosDocumentVersions(rawTzpiRows, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const rawTzesRows = await parseCredosDollarFile(sourceFiles.tzes);
  const tzesRows = keepLatestCredosDocumentVersions(rawTzesRows, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const rawTzeyRows = await parseOptionalCredosFile(sourceFiles.tzey);
  const tzeyRows = keepLatestCredosDocumentVersions(rawTzeyRows, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const rawTzvsRows = await parseCredosDollarFile(sourceFiles.tzvs);
  const tzvsRows = keepLatestCredosDocumentVersions(rawTzvsRows, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const rawTzvyRows = await parseOptionalCredosFile(sourceFiles.tzvy);
  const tzvyRows = keepLatestCredosDocumentVersions(rawTzvyRows, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const rawTzthRows = await parseOptionalCredosFile(sourceFiles.tzth);
  const tzthRows = keepLatestCredosDocumentVersions(rawTzthRows, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const rawTztiRows = await parseCredosDollarFile(sourceFiles.tzti);
  const tztiRows = keepLatestCredosDocumentVersions(rawTztiRows, {
    documentNumberField: "doknr",
    documentVersionField: "dokvr",
    deleteFlagField: "loekz",
    deleteFlagValue: "X"
  });

  /**
   * Für Testdaten:
   * - numerische TZ_T_TID bleiben unverändert
   * - Hashes/String-IDs werden stabil zu Nummern gemappt
   *
   * Wichtig:
   * Dieselbe Factory wird für diagnosis und therapy genutzt,
   * damit gleiche Tumor-Hashes in beiden Collections dieselbe Nummer bekommen.
   */
  const getNumericTumorId = createStableNumericIdFactory({
    startAt: 1
  });

  const patient = buildPatients({
    npatRows,
    tzpiRows
  });

  const diagnosis = buildDiagnoses({
    tzesRows,
    tzeyRows,
    tzvsRows,
    tzvyRows,
    tztiRows,
    validPatients: patient,
    getNumericTumorId,
    dd07vLookup
  });

  const therapy = buildTherapies({
    tzthRows,
    tztiRows,
    validPatients: patient,
    getNumericTumorId
  });

  const omock = {
    patient,
    diagnosis,
    therapy
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryOutputPath = `${outputPath}.tmp`;

  await fs.writeFile(temporaryOutputPath, JSON.stringify(omock, null, 2), "utf8");
  await fs.rename(temporaryOutputPath, outputPath);

  console.log(`omock geschrieben: ${outputPath}`);
  console.log(`Patienten geschrieben: ${patient.length}`);
  console.log(`Diagnosen geschrieben: ${diagnosis.length}`);
  console.log(`Therapien geschrieben: ${therapy.length}`);

  console.log(`tzpi roh: ${rawTzpiRows.length}`);
  console.log(`tzpi nach Versionierung/Löschkennzeichen: ${tzpiRows.length}`);

  console.log(`tzes roh: ${rawTzesRows.length}`);
  console.log(`tzes nach Versionierung/Löschkennzeichen: ${tzesRows.length}`);

  console.log(`tzey roh: ${rawTzeyRows.length}`);
  console.log(`tzey nach Versionierung/Löschkennzeichen: ${tzeyRows.length}`);

  console.log(`tzvs roh: ${rawTzvsRows.length}`);
  console.log(`tzvs nach Versionierung/Löschkennzeichen: ${tzvsRows.length}`);

  console.log(`tzvy roh: ${rawTzvyRows.length}`);
  console.log(`tzvy nach Versionierung/Löschkennzeichen: ${tzvyRows.length}`);

  console.log(`tzth roh: ${rawTzthRows.length}`);
  console.log(`tzth nach Versionierung/Löschkennzeichen: ${tzthRows.length}`);

  console.log(`tzti roh: ${rawTztiRows.length}`);
  console.log(`tzti nach Versionierung/Löschkennzeichen: ${tztiRows.length}`);
}

async function parseOptionalCredosFile(filePath) {
  try {
    return await parseCredosDollarFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`Optionale Datei nicht gefunden: ${filePath}`);
      return [];
    }

    throw error;
  }
}

function buildPatients({ npatRows, tzpiRows }) {
  const tzpiByPatId = indexBy(tzpiRows, "TZ_P_PID");

  return npatRows
    .map(npatRow => {
      const patID = getPatientId(npatRow);

      if (!patID) {
        return null;
      }

      const tzpiRow = tzpiByPatId.get(String(patID).trim());

      /**
       * Nur Patienten übernehmen, die wirklich einen gültigen Eintrag
       * in tzpi.txt haben.
       */
      if (!tzpiRow) {
        return null;
      }

      return mapPatient(npatRow, tzpiRow, patID);
    })
    .filter(Boolean);
}

function buildDiagnoses({
  tzesRows,
  tzeyRows,
  tzvsRows,
  tzvyRows,
  tztiRows,
  validPatients,
  getNumericTumorId,
  dd07vLookup
}) {
  /**
   * Wir übernehmen nur Diagnosen für Patienten,
   * die auch in omock.patient gelandet sind.
   */
  const validPatientIds = createValidPatientIdSet(validPatients);

  /**
   * Verlauf solide:
   * TZVS liefert Zentrumsfall für TZES-Diagnosen.
   */
  const tzvsByTumorId = indexFirstCenterCaseByTumorId(tzvsRows, [
    "TZV_ZFALL",
    "TZVS_ZFALL",
    "ZFALL"
  ]);

  /**
   * Verlauf systemisch:
   * TZVY liefert Zentrumsfall für TZEY-Diagnosen.
   */
  const tzvyByTumorId = indexFirstCenterCaseByTumorId(tzvyRows, [
    "TZVY_ZFALL",
    "TZV_ZFALL",
    "ZFALL"
  ]);

  /**
   * TZTI:
   * organizationalUnit kommt aus orgfa.
   * Gebunden wird über Dokumentnummer:
   * tzes.DOKNR/tzey.DOKNR == tzti.doknr
   */
  const tztiByDocumentNumber = indexFirstTztiOrgUnitByDocumentNumber(tztiRows);

  const diagnosisFromTzes = buildDiagnosesFromRows({
    rows: tzesRows,
    sourceType: "tzes",
    validPatientIds,
    centerCaseByTumorId: tzvsByTumorId,
    tztiByDocumentNumber,
    getNumericTumorId,
    dd07vLookup
  });

  const diagnosisFromTzey = buildDiagnosesFromRows({
    rows: tzeyRows,
    sourceType: "tzey",
    validPatientIds,
    centerCaseByTumorId: tzvyByTumorId,
    tztiByDocumentNumber,
    getNumericTumorId,
    dd07vLookup
  });

  console.log(`Diagnosen aus tzes: ${diagnosisFromTzes.length}`);
  console.log(`Diagnosen aus tzey: ${diagnosisFromTzey.length}`);

  return [
    ...diagnosisFromTzes,
    ...diagnosisFromTzey
  ];
}

function buildDiagnosesFromRows({
  rows,
  sourceType,
  validPatientIds,
  centerCaseByTumorId,
  tztiByDocumentNumber,
  getNumericTumorId,
  dd07vLookup
}) {
  return rows
    .map(row => {
      const patID = getFirstValue(row, [
        "TZ_P_PID",
        "PATID",
        "patid"
      ]);

      if (!patID) {
        return null;
      }

      const normalizedPatID = String(patID).trim();

      if (!validPatientIds.has(normalizedPatID)) {
        return null;
      }

      const tumorId = getFirstValue(row, [
        "TZ_T_TID",
        "tumorid",
        "TUMORID"
      ]);

      const tumorKey = tumorId ? String(tumorId).trim() : null;

      const documentNumber = getFirstValue(row, [
        "DOKNR",
        "doknr"
      ]);

      const documentKey = documentNumber
        ? String(documentNumber).trim()
        : null;

      const centerCaseRow = tumorKey
        ? centerCaseByTumorId.get(tumorKey)
        : null;

      const tztiRow = documentKey
        ? tztiByDocumentNumber.get(documentKey)
        : null;

      return mapDiagnosis(row, {
        sourceType,
        centerCaseRow,
        tztiRow,
        getNumericTumorId,
        dd07vLookup
      });
    })
    .filter(Boolean);
}

function buildTherapies({
  tzthRows,
  tztiRows,
  validPatients,
  getNumericTumorId
}) {
  /**
   * Wir übernehmen erstmal nur Therapien für Patienten,
   * die auch in omock.patient gelandet sind.
   */
  const validPatientIds = createValidPatientIdSet(validPatients);

  /**
   * TZTI:
   * organizationalUnit kommt aus orgfa.
   * Gebunden wird über Dokumentnummer:
   * tzth.DOKNR == tzti.doknr
   */
  const tztiByDocumentNumber = indexFirstTztiOrgUnitByDocumentNumber(tztiRows);

  let nextTherapyID = 1;

  return tzthRows
    .map(tzthRow => {
      const patID = getFirstValue(tzthRow, [
        "TZ_P_PID",
        "PATID",
        "patid"
      ]);

      if (!patID) {
        return null;
      }

      const normalizedPatID = String(patID).trim();

      if (!validPatientIds.has(normalizedPatID)) {
        return null;
      }

      const documentNumber = getFirstValue(tzthRow, [
        "DOKNR",
        "doknr"
      ]);

      const documentKey = documentNumber
        ? String(documentNumber).trim()
        : null;

      const tztiRow = documentKey
        ? tztiByDocumentNumber.get(documentKey)
        : null;

      const therapy = mapTherapy(tzthRow, {
        therapyID: nextTherapyID,
        tztiRow,
        getNumericTumorId
      });

      nextTherapyID += 1;

      return therapy;
    })
    .filter(Boolean);
}

function createValidPatientIdSet(validPatients) {
  return new Set(
    validPatients
      .map(patient => patient.patID)
      .filter(Boolean)
      .map(patID => String(patID).trim())
  );
}

function indexFirstCenterCaseByTumorId(rows, centerCaseFieldNames) {
  const index = new Map();

  for (const row of rows) {
    const tumorId = getFirstValue(row, [
      "TZ_T_TID",
      "tumorid",
      "TUMORID"
    ]);

    const centerCase = getFirstValue(row, centerCaseFieldNames);

    if (tumorId === null || tumorId === undefined || tumorId === "") {
      continue;
    }

    if (centerCase === null || centerCase === undefined || centerCase === "") {
      continue;
    }

    const tumorKey = String(tumorId).trim();

    /**
     * Ersten befüllten ZFALL-Wert pro Tumor behalten.
     * Weitere Einträge sind für diese Regel egal.
     */
    if (!index.has(tumorKey)) {
      index.set(tumorKey, row);
    }
  }

  return index;
}

function indexFirstTztiOrgUnitByDocumentNumber(tztiRows) {
  const index = new Map();

  for (const tztiRow of tztiRows) {
    const documentNumber = getFirstValue(tztiRow, [
      "doknr",
      "DOKNR"
    ]);

    const organizationalUnit = getFirstValue(tztiRow, [
      "orgfa",
      "ORGFA"
    ]);

    if (
      documentNumber === null ||
      documentNumber === undefined ||
      documentNumber === ""
    ) {
      continue;
    }

    if (
      organizationalUnit === null ||
      organizationalUnit === undefined ||
      organizationalUnit === ""
    ) {
      continue;
    }

    const documentKey = String(documentNumber).trim();

    /**
     * Ersten befüllten orgfa-Wert pro Dokumentnummer behalten.
     */
    if (!index.has(documentKey)) {
      index.set(documentKey, tztiRow);
    }
  }

  return index;
}

function getFirstValue(row, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = row[fieldName];

    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function getPatientId(npatRow) {
  /**
   * TODO:
   * Sobald du den echten Feldnamen in npat.txt sicher kennst,
   * am besten auf genau dieses eine Feld reduzieren.
   *
   * Beispiel:
   * return npatRow.pid ?? null;
   */
  return (
    npatRow.patID ??
    npatRow.PATID ??
    npatRow.patid ??
    npatRow.PID ??
    npatRow.pid ??
    npatRow.PATNR ??
    npatRow.patnr ??
    null
  );
}

main().catch(error => {
  console.error("CREDOS Import fehlgeschlagen:");
  console.error(error);
  process.exit(1);
});
