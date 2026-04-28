// credosImporter.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCredosDollarFile } from "./credosDollarParser.mjs";

import { mapPatient } from "./mappers/patientMapper.mjs";
import { mapDiagnosis } from "./mappers/diagnosisMapper.mjs";

import { indexBy } from "./utils/indexBy.mjs";
import { keepLatestCredosDocumentVersions } from "./utils/credosVersioning.mjs";
import { createStableNumericIdFactory } from "./utils/idFactory.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exportDir = path.join(__dirname, "CREDOSExportFiles");
const outputPath = path.join(__dirname, "omock.json");

const sourceFiles = {
  npat: path.join(exportDir, "npat.txt"),
  tzpi: path.join(exportDir, "tzpi.txt"),
  tzes: path.join(exportDir, "tzes.txt")
};

async function main() {
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

  /**
   * Für Testdaten:
   * - numerische TZ_T_TID bleiben unverändert
   * - Hashes/String-IDs werden stabil zu Nummern gemappt
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
    validPatients: patient,
    getNumericTumorId
  });

  const omock = {
    patient,
    diagnosis
  };

  await fs.writeFile(outputPath, JSON.stringify(omock, null, 2), "utf8");

  console.log(`omock geschrieben: ${outputPath}`);
  console.log(`Patienten geschrieben: ${patient.length}`);
  console.log(`Diagnosen geschrieben: ${diagnosis.length}`);
  console.log(`tzpi roh: ${rawTzpiRows.length}`);
  console.log(`tzpi nach Versionierung/Löschkennzeichen: ${tzpiRows.length}`);
  console.log(`tzes roh: ${rawTzesRows.length}`);
  console.log(`tzes nach Versionierung/Löschkennzeichen: ${tzesRows.length}`);
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

function buildDiagnoses({ tzesRows, validPatients, getNumericTumorId }) {
  /**
   * Wir übernehmen nur Diagnosen für Patienten,
   * die auch in omock.patient gelandet sind.
   */
  const validPatientIds = new Set(
    validPatients
      .map(patient => patient.patID)
      .filter(Boolean)
      .map(patID => String(patID).trim())
  );

  return tzesRows
    .map(tzesRow => {
      const patID = tzesRow.TZ_P_PID ? String(tzesRow.TZ_P_PID).trim() : null;

      if (!patID) {
        return null;
      }

      if (!validPatientIds.has(patID)) {
        return null;
      }

      return mapDiagnosis(tzesRow, {
        getNumericTumorId
      });
    })
    .filter(Boolean);
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