// credosImporter.mjs

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCredosDollarFile } from "./credosDollarParser.mjs";
import { mapConsultation } from "./mappers/consultationMapper.mjs";
import { mapDiagnosis } from "./mappers/diagnosisMapper.mjs";
import { mapDiagnostic } from "./mappers/diagnosticMapper.mjs";
import { mapMetastasis } from "./mappers/metastasisMapper.mjs";
import { mapMolecularMarker } from "./mappers/molecularMarkerMapper.mjs";
import { mapPatient } from "./mappers/patientMapper.mjs";
import { mapProgress } from "./mappers/progressMapper.mjs";
import { mapSingleRadiation } from "./mappers/singleRadiationMapper.mjs";
import { mapSupplementary } from "./mappers/supplementaryMapper.mjs";
import { mapTherapy } from "./mappers/therapyMapper.mjs";
import { mapTnmsForRow } from "./mappers/tnmMapper.mjs";
import { mapTumorBoardsForRow } from "./mappers/tumorBoardMapper.mjs";
import { buildStudiesForUlm } from "./UTMS_ULM.mjs";
import { createComplicationLookup } from "./utils/complicationLookup.mjs";
import { keepLatestCredosDocumentVersions } from "./utils/credosVersioning.mjs";
import { createDd07vLookup } from "./utils/dd07vLookup.mjs";
import { createStableNumericIdFactory } from "./utils/idFactory.mjs";
import { indexBy } from "./utils/indexBy.mjs";
import { createMolecularMarkerLookup } from "./utils/molecularMarkerLookup.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exportDir = resolveExportDir();
const outputPath = resolveOutputPath();

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
   * - TZTH_KP = Komplikationen zur Therapie
   */
  tzth: path.join(exportDir, "tzth.txt"),
  tzthKp: path.join(exportDir, "tzth_kp.txt"),
  tzthStr: path.join(exportDir, "tzth_str.txt"),

  /**
   * Diagnostics:
   */
  tzesDiag: path.join(exportDir, "tzes_diag.txt"),
  tzeyDiag: path.join(exportDir, "tzey_diag.txt"),
  tzvsDiag: path.join(exportDir, "tzvs_diag.txt"),
  tzvyDiag: path.join(exportDir, "tzvy_diag.txt"),

  /**
   * Metastasen:
   */
  tzesFm: path.join(exportDir, "tzes_fm.txt"),
  tzvsFm: path.join(exportDir, "tzvs_fm.txt"),

  /**
   * Tumorkonferenz:
   */
  tzesTb: path.join(exportDir, "tzes_tb.txt"),
  tzvsTb: path.join(exportDir, "tzvs_tb.txt"),

  /**
   * Beratungen / Consultations:
   */
  tzesBr: path.join(exportDir, "tzes_br.txt"),
  tzeyBr: path.join(exportDir, "tzey_br.txt"),
  tzvsBr: path.join(exportDir, "tzvs_br.txt"),
  tzvyBr: path.join(exportDir, "tzvy_br.txt"),

  /**
   * Supplementary / Klassifikationen:
   */
  tzesKl: path.join(exportDir, "tzes_kl.txt"),
  tzeyKl: path.join(exportDir, "tzey_kl.txt"),
  tzvsKl: path.join(exportDir, "tzvs_kl.txt"),
  tzvyKl: path.join(exportDir, "tzvy_kl.txt"),
  tzthKl: path.join(exportDir, "tzth_kl.txt"),

  /**
   * Supplementary / Zusatzangaben:
   */
  tzesZa: path.join(exportDir, "tzes_za.txt"),
  tzeyZa: path.join(exportDir, "tzey_za.txt"),
  tzvsZa: path.join(exportDir, "tzvs_za.txt"),
  tzvyZa: path.join(exportDir, "tzvy_za.txt"),
  tzthZa: path.join(exportDir, "tzth_za.txt"),

  /**
   * Molecular Marker / Genetik:
   */
  tzesGen: path.join(exportDir, "tzes_gen.txt"),
  tzeyGen: path.join(exportDir, "tzey_gen.txt"),
  tzvsGen: path.join(exportDir, "tzvs_gen.txt"),
  tzvyGen: path.join(exportDir, "tzvy_gen.txt"),

  /**
   * Lookup-Dateien für molekulare Marker:
   */
  zn2crgenenquiry: path.join(exportDir, "zn2crgenenquiry.txt"),
  zn2crgenclasses: path.join(exportDir, "zn2crgenclasses.txt"),
  zn2crgenstages: path.join(exportDir, "zn2crgenstages.txt"),
  zn2crgeninfo: path.join(exportDir, "zn2crgeninfo.txt"),

  /**
   * Komplikationswerte / Staging:
   */
  zn2crkomplclas: path.join(exportDir, "zn2crkomplclas.txt"),
  zn2crkomplsstag: path.join(exportDir, "zn2crkomplsstag.txt"),

  /**
   * Zusatzinformationen:
   */
  tzti: path.join(exportDir, "tzti.txt"),

  /**
   * SAP/DD07V Wertehilfe:
   */
  dd07v: path.join(exportDir, "dd07v.txt")
};

async function main() {
  console.log(`CREDOS Import nutzt Export-Ordner: ${exportDir}`);
  console.log(`CREDOS omock output: ${outputPath}`);

  const dd07vLookup = await createDd07vLookup(sourceFiles.dd07v);

  const complicationLookup = await createOptionalComplicationLookup({
    classesFile: sourceFiles.zn2crkomplclas,
    stagesFile: sourceFiles.zn2crkomplsstag
  });

  const molecularMarkerLookup = await createMolecularMarkerLookup({
    enquiryFile: sourceFiles.zn2crgenenquiry,
    classesFile: sourceFiles.zn2crgenclasses,
    stagesFile: sourceFiles.zn2crgenstages,
    infoFile: sourceFiles.zn2crgeninfo
  });

  const npatRows = await parseCredosDollarFile(sourceFiles.npat);

  const {
    rows: tzpiRows,
    rawCount: tzpiRawCount
  } = await parseLatestCredosDocumentVersions(sourceFiles.tzpi, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const {
    rows: tzesRows,
    rawCount: tzesRawCount
  } = await parseLatestCredosDocumentVersions(sourceFiles.tzes, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const {
    rows: tzeyRows,
    rawCount: tzeyRawCount
  } = await parseOptionalLatestCredosDocumentVersions(sourceFiles.tzey, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const {
    rows: tzvsRows,
    rawCount: tzvsRawCount
  } = await parseLatestCredosDocumentVersions(sourceFiles.tzvs, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const {
    rows: tzvyRows,
    rawCount: tzvyRawCount
  } = await parseOptionalLatestCredosDocumentVersions(sourceFiles.tzvy, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const {
    rows: tzthRows,
    rawCount: tzthRawCount
  } = await parseOptionalLatestCredosDocumentVersions(sourceFiles.tzth, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  /**
   * Wichtig:
   * TZTH_KP nicht per DOKNR deduplizieren.
   * Pro Therapie-Dokument können mehrere Komplikationen existieren.
   */
  const tzthKpRows = await parseOptionalCredosFile(sourceFiles.tzthKp);

  /**
   * Wichtig:
   * TZTH_STR nicht per DOKNR deduplizieren.
   * Pro Therapie-Dokument können mehrere Bestrahlungsdetails existieren.
   */
  const tzthStrRows = await parseOptionalCredosFile(sourceFiles.tzthStr);

  const tzesDiagRows = await parseOptionalCredosFile(sourceFiles.tzesDiag);
  const tzeyDiagRows = await parseOptionalCredosFile(sourceFiles.tzeyDiag);
  const tzvsDiagRows = await parseOptionalCredosFile(sourceFiles.tzvsDiag);
  const tzvyDiagRows = await parseOptionalCredosFile(sourceFiles.tzvyDiag);

  /**
   * Wichtig:
   * tzes_fm/tzvs_fm nicht per DOKNR deduplizieren.
   * Pro Dokument können mehrere Metastasen existieren.
   */
  const tzesFmRows = await parseOptionalCredosFile(sourceFiles.tzesFm);
  const tzvsFmRows = await parseOptionalCredosFile(sourceFiles.tzvsFm);

  const {
    rows: tzesTbRows,
    rawCount: tzesTbRawCount
  } = await parseOptionalLatestCredosDocumentVersions(sourceFiles.tzesTb, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  const {
    rows: tzvsTbRows,
    rawCount: tzvsTbRawCount
  } = await parseOptionalLatestCredosDocumentVersions(sourceFiles.tzvsTb, {
    documentNumberField: "DOKNR",
    documentVersionField: "DOKVR",
    deleteFlagField: "TZ_LOEKZ",
    deleteFlagValue: "X"
  });

  /**
   * Wichtig:
   * *_br nicht per DOKNR deduplizieren.
   * Pro Dokument können mehrere Beratungen existieren.
   */
  const tzesBrRows = await parseOptionalCredosFile(sourceFiles.tzesBr);
  const tzeyBrRows = await parseOptionalCredosFile(sourceFiles.tzeyBr);
  const tzvsBrRows = await parseOptionalCredosFile(sourceFiles.tzvsBr);
  const tzvyBrRows = await parseOptionalCredosFile(sourceFiles.tzvyBr);

  /**
   * Wichtig:
   * *_kl nicht per DOKNR deduplizieren.
   * Pro Dokument können mehrere Klassifikationen/Stadien existieren.
   */
  const tzesKlRows = await parseOptionalCredosFile(sourceFiles.tzesKl);
  const tzeyKlRows = await parseOptionalCredosFile(sourceFiles.tzeyKl);
  const tzvsKlRows = await parseOptionalCredosFile(sourceFiles.tzvsKl);
  const tzvyKlRows = await parseOptionalCredosFile(sourceFiles.tzvyKl);
  const tzthKlRows = await parseOptionalCredosFile(sourceFiles.tzthKl);

  /**
   * Wichtig:
   * *_za nicht per DOKNR deduplizieren.
   * Pro Dokument können mehrere Zusatzangaben existieren.
   */
  const tzesZaRows = await parseOptionalCredosFile(sourceFiles.tzesZa);
  const tzeyZaRows = await parseOptionalCredosFile(sourceFiles.tzeyZa);
  const tzvsZaRows = await parseOptionalCredosFile(sourceFiles.tzvsZa);
  const tzvyZaRows = await parseOptionalCredosFile(sourceFiles.tzvyZa);
  const tzthZaRows = await parseOptionalCredosFile(sourceFiles.tzthZa);

  /**
   * Wichtig:
   * *_gen nicht per DOKNR deduplizieren.
   * Pro Dokument können mehrere molekulare Marker existieren.
   */
  const tzesGenRows = await parseOptionalCredosFile(sourceFiles.tzesGen);
  const tzeyGenRows = await parseOptionalCredosFile(sourceFiles.tzeyGen);
  const tzvsGenRows = await parseOptionalCredosFile(sourceFiles.tzvsGen);
  const tzvyGenRows = await parseOptionalCredosFile(sourceFiles.tzvyGen);

  const {
    rows: tztiRows,
    rawCount: tztiRawCount
  } = await parseLatestCredosDocumentVersions(sourceFiles.tzti, {
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
   * Dieselbe Factory wird für alle Collections genutzt,
   * damit gleiche Tumor-Hashes überall dieselbe Nummer bekommen.
   */
  const getNumericTumorId = createStableNumericIdFactory({
    startAt: 1
  });

  const writer = await createOmockWriter(outputPath);

  let patient = null;

  try {
    patient = buildPatients({
      npatRows,
      tzpiRows,
      dd07vLookup
    });
    await appendOmockEntry(writer, "patient", patient);
    console.log(`Patienten geschrieben: ${patient.length}`);

    let diagnosis = buildDiagnoses({
      tzesRows,
      tzeyRows,
      tzvsRows,
      tzvyRows,
      tztiRows,
      validPatients: patient,
      getNumericTumorId,
      dd07vLookup
    });
    await appendOmockEntry(writer, "diagnosis", diagnosis);
    console.log(`Diagnosen geschrieben: ${diagnosis.length}`);
    diagnosis = null;

    const therapyIdByDocumentNumber = new Map();

    let therapy = buildTherapies({
      tzthRows,
      tzthKpRows,
      validPatients: patient,
      getNumericTumorId,
      dd07vLookup,
      complicationLookup,
      therapyIdByDocumentNumber
    });
    await appendOmockEntry(writer, "therapy", therapy);
    console.log(`Therapien geschrieben: ${therapy.length}`);
    therapy = null;

    let diagnostic = buildDiagnostics({
      tzesDiagRows,
      tzeyDiagRows,
      tzvsDiagRows,
      tzvyDiagRows,
      tzesRows,
      tzeyRows,
      tzvsRows,
      tzvyRows,
      validPatients: patient,
      getNumericTumorId,
      dd07vLookup
    });
    await appendOmockEntry(writer, "diagnostic", diagnostic);
    console.log(`Diagnostics geschrieben: ${diagnostic.length}`);
    diagnostic = null;

    let progress = buildProgresses({
      tzvsRows,
      tzvyRows,
      validPatients: patient,
      getNumericTumorId,
      dd07vLookup
    });
    await appendOmockEntry(writer, "progress", progress);
    console.log(`Progress geschrieben: ${progress.length}`);
    progress = null;

    let tnm = buildTnms({
      tzesRows,
      tzthRows,
      tzvsRows,
      validPatients: patient,
      getNumericTumorId
    });
    await appendOmockEntry(writer, "tnm", tnm);
    console.log(`TNM geschrieben: ${tnm.length}`);
    tnm = null;

    let metastasis = buildMetastases({
      tzesFmRows,
      tzvsFmRows,
      tzesRows,
      tzvsRows,
      validPatients: patient,
      getNumericTumorId
    });
    await appendOmockEntry(writer, "metastasis", metastasis);
    console.log(`Metastasen geschrieben: ${metastasis.length}`);
    metastasis = null;

    let tumorBoard = buildTumorBoards({
      tzesTbRows,
      tzvsTbRows,
      tzeyRows,
      validPatients: patient,
      getNumericTumorId,
      dd07vLookup
    });
    await appendOmockEntry(writer, "tumorBoard", tumorBoard);
    console.log(`Tumorboards geschrieben: ${tumorBoard.length}`);
    tumorBoard = null;

    let consultation = buildConsultations({
      tzesBrRows,
      tzeyBrRows,
      tzvsBrRows,
      tzvyBrRows,
      tzesRows,
      tzeyRows,
      tzvsRows,
      tzvyRows,
      validPatients: patient,
      getNumericTumorId,
      dd07vLookup
    });
    await appendOmockEntry(writer, "consultation", consultation);
    console.log(`Consultations geschrieben: ${consultation.length}`);
    consultation = null;

    let supplementary = buildSupplementaries({
      tzesKlRows,
      tzeyKlRows,
      tzvsKlRows,
      tzvyKlRows,
      tzthKlRows,
      tzesZaRows,
      tzeyZaRows,
      tzvsZaRows,
      tzvyZaRows,
      tzthZaRows,
      tzesRows,
      tzeyRows,
      tzvsRows,
      tzvyRows,
      tzthRows,
      validPatients: patient,
      getNumericTumorId
    });
    await appendOmockEntry(writer, "supplementary", supplementary);
    console.log(`Supplementaries geschrieben: ${supplementary.length}`);
    supplementary = null;

    let molecularMarker = buildMolecularMarkers({
      tzesGenRows,
      tzeyGenRows,
      tzvsGenRows,
      tzvyGenRows,
      tzesRows,
      tzeyRows,
      tzvsRows,
      tzvyRows,
      validPatients: patient,
      getNumericTumorId,
      dd07vLookup,
      molecularMarkerLookup
    });
    await appendOmockEntry(writer, "molecularMarker", molecularMarker);
    console.log(`Molecular Marker geschrieben: ${molecularMarker.length}`);
    molecularMarker = null;

    let singleRadiation = buildSingleRadiations({
      tzthStrRows,
      tzthRows,
      therapyIdByDocumentNumber,
      dd07vLookup
    });
    await appendOmockEntry(writer, "singleRadiation", singleRadiation);
    console.log(`Single Radiations geschrieben: ${singleRadiation.length}`);
    singleRadiation = null;

    let study = await buildStudies({
      patient
    });
    await appendOmockEntry(writer, "study", study);
    console.log(`Studien geschrieben: ${study.length}`);
    study = null;

    await closeOmockWriter(writer, outputPath);
    console.log(`omock geschrieben: ${outputPath}`);
  } catch (error) {
    await abortOmockWriter(writer);
    throw error;
  }

  console.log(`tzpi roh: ${tzpiRawCount}`);
  console.log(`tzpi nach Versionierung/Löschkennzeichen: ${tzpiRows.length}`);

  console.log(`tzes roh: ${tzesRawCount}`);
  console.log(`tzes nach Versionierung/Löschkennzeichen: ${tzesRows.length}`);

  console.log(`tzey roh: ${tzeyRawCount}`);
  console.log(`tzey nach Versionierung/Löschkennzeichen: ${tzeyRows.length}`);

  console.log(`tzvs roh: ${tzvsRawCount}`);
  console.log(`tzvs nach Versionierung/Löschkennzeichen: ${tzvsRows.length}`);

  console.log(`tzvy roh: ${tzvyRawCount}`);
  console.log(`tzvy nach Versionierung/Löschkennzeichen: ${tzvyRows.length}`);

  console.log(`tzth roh: ${tzthRawCount}`);
  console.log(`tzth nach Versionierung/Löschkennzeichen: ${tzthRows.length}`);

  console.log(`tzth_kp roh: ${tzthKpRows.length}`);
  console.log(`tzth_str roh: ${tzthStrRows.length}`);
  console.log(`Komplikations-Lookup aktiv: ${complicationLookup ? "ja" : "nein"}`);

  console.log(`tzes_diag roh: ${tzesDiagRows.length}`);
  console.log(`tzey_diag roh: ${tzeyDiagRows.length}`);
  console.log(`tzvs_diag roh: ${tzvsDiagRows.length}`);
  console.log(`tzvy_diag roh: ${tzvyDiagRows.length}`);

  console.log(`tzes_fm roh: ${tzesFmRows.length}`);
  console.log(`tzvs_fm roh: ${tzvsFmRows.length}`);

  console.log(`tzes_tb roh: ${tzesTbRawCount}`);
  console.log(`tzes_tb nach Versionierung/Löschkennzeichen: ${tzesTbRows.length}`);

  console.log(`tzvs_tb roh: ${tzvsTbRawCount}`);
  console.log(`tzvs_tb nach Versionierung/Löschkennzeichen: ${tzvsTbRows.length}`);

  console.log(`tzes_br roh: ${tzesBrRows.length}`);
  console.log(`tzey_br roh: ${tzeyBrRows.length}`);
  console.log(`tzvs_br roh: ${tzvsBrRows.length}`);
  console.log(`tzvy_br roh: ${tzvyBrRows.length}`);

  console.log(`tzes_kl roh: ${tzesKlRows.length}`);
  console.log(`tzey_kl roh: ${tzeyKlRows.length}`);
  console.log(`tzvs_kl roh: ${tzvsKlRows.length}`);
  console.log(`tzvy_kl roh: ${tzvyKlRows.length}`);
  console.log(`tzth_kl roh: ${tzthKlRows.length}`);

  console.log(`tzes_za roh: ${tzesZaRows.length}`);
  console.log(`tzey_za roh: ${tzeyZaRows.length}`);
  console.log(`tzvs_za roh: ${tzvsZaRows.length}`);
  console.log(`tzvy_za roh: ${tzvyZaRows.length}`);
  console.log(`tzth_za roh: ${tzthZaRows.length}`);

  console.log(`tzes_gen roh: ${tzesGenRows.length}`);
  console.log(`tzey_gen roh: ${tzeyGenRows.length}`);
  console.log(`tzvs_gen roh: ${tzvsGenRows.length}`);
  console.log(`tzvy_gen roh: ${tzvyGenRows.length}`);

  console.log(`tzti roh: ${tztiRawCount}`);
  console.log(`tzti nach Versionierung/Löschkennzeichen: ${tztiRows.length}`);
}

async function createOmockWriter(filePath) {
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.rm(tmpPath, { force: true });

  const handle = await fs.open(tmpPath, "w");
  await handle.write("{\n");

  return {
    handle,
    tmpPath,
    isFirstEntry: true,
    isClosed: false
  };
}

async function appendOmockEntry(writer, key, value) {
  if (!writer || writer.isClosed) {
    throw new Error("omock writer ist nicht geöffnet.");
  }

  await writer.handle.write(writer.isFirstEntry ? "" : ",\n");
  writer.isFirstEntry = false;

  await writer.handle.write(`${JSON.stringify(key)}:`);

  if (Array.isArray(value)) {
    await writeJsonArray(writer.handle, value);
    return;
  }

  await writer.handle.write(JSON.stringify(value ?? null));
}

async function writeJsonArray(handle, rows) {
  await handle.write("[");

  const buffer = [];
  let bufferedCharacters = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const json = JSON.stringify(rows[index] ?? null);
    const chunk = `${index === 0 ? "" : ","}${json}`;

    buffer.push(chunk);
    bufferedCharacters += chunk.length;

    if (buffer.length >= 1000 || bufferedCharacters >= 1024 * 1024) {
      await handle.write(buffer.join(""));
      buffer.length = 0;
      bufferedCharacters = 0;
    }
  }

  if (buffer.length > 0) {
    await handle.write(buffer.join(""));
  }

  await handle.write("]");
}

async function closeOmockWriter(writer, filePath) {
  if (!writer || writer.isClosed) {
    return;
  }

  await writer.handle.write("\n}\n");
  await writer.handle.close();
  writer.isClosed = true;

  await fs.rm(filePath, { force: true });
  await fs.rename(writer.tmpPath, filePath);
}

async function abortOmockWriter(writer) {
  if (!writer || writer.isClosed) {
    return;
  }

  try {
    await writer.handle.close();
  } catch {
    // ignore cleanup errors
  }

  writer.isClosed = true;

  try {
    await fs.rm(writer.tmpPath, { force: true });
  } catch {
    // ignore cleanup errors
  }
}

async function buildStudies({ patient }) {
  const studySystem = normalizeStudySystem(process.env.STUDY_SYSTEM);

  if (studySystem !== "ULM") {
    console.log(`Studienimport übersprungen: STUDY_SYSTEM=${process.env.STUDY_SYSTEM ?? ""}`);
    return [];
  }

  return await buildStudiesForUlm({
    validPatients: patient
  });
}

function normalizeStudySystem(value) {
  return (value ?? "")
    .toString()
    .trim()
    .toUpperCase();
}

function resolveExportDir() {
  const candidates = [
    process.env.CREDOS_EXPORT_DIR,
    "/input/CREDOSExportFiles",
    path.join(__dirname, "CREDOSExportFiles")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

function resolveOutputPath() {
  if (process.env.CREDOS_OMOCK_OUTPUT) {
    return process.env.CREDOS_OMOCK_OUTPUT;
  }

  if (existsSync("/output")) {
    return "/output/omock.json";
  }

  return path.join(__dirname, "omock.json");
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

async function parseLatestCredosDocumentVersions(filePath, options) {
  const rawRows = await parseCredosDollarFile(filePath);

  return {
    rawCount: rawRows.length,
    rows: keepLatestCredosDocumentVersions(rawRows, options)
  };
}

async function parseOptionalLatestCredosDocumentVersions(filePath, options) {
  try {
    return await parseLatestCredosDocumentVersions(filePath, options);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`Optionale Datei nicht gefunden: ${filePath}`);
      return {
        rawCount: 0,
        rows: []
      };
    }

    throw error;
  }
}

async function createOptionalComplicationLookup({
  classesFile,
  stagesFile
}) {
  try {
    return await createComplicationLookup({
      classesFile,
      stagesFile
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn("Komplikations-Lookup-Dateien nicht vollständig gefunden. Komplikationen werden mit Fallbacks importiert.");
      return null;
    }

    throw error;
  }
}

function buildPatients({ npatRows, tzpiRows, dd07vLookup }) {
  const tzpiByPatId = indexBy(tzpiRows, "TZ_P_PID");

  return npatRows
    .map(npatRow => {
      const patID = getPatientId(npatRow);

      if (!patID) {
        return null;
      }

      const tzpiRow = tzpiByPatId.get(String(patID).trim());

      if (!tzpiRow) {
        return null;
      }

      return mapPatient(npatRow, tzpiRow, patID, { dd07vLookup });
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
  const validPatientIds = createValidPatientIdSet(validPatients);

  const tzvsByTumorId = indexFirstCenterCaseByTumorId(tzvsRows, [
    "TZV_ZFALL",
    "TZVS_ZFALL",
    "ZFALL"
  ]);

  const tzvyByTumorId = indexFirstCenterCaseByTumorId(tzvyRows, [
    "TZVY_ZFALL",
    "TZV_ZFALL",
    "ZFALL"
  ]);

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
  tzthKpRows,
  validPatients,
  getNumericTumorId,
  dd07vLookup,
  complicationLookup,
  therapyIdByDocumentNumber
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);
  const complicationRowsByDocumentNumber = indexRowsByDocumentNumber(tzthKpRows);

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

      const complicationRows = documentKey
        ? complicationRowsByDocumentNumber.get(documentKey) ?? []
        : [];

      const therapyID = nextTherapyID;

      const therapy = mapTherapy(tzthRow, {
        therapyID,
        complicationRows,
        getNumericTumorId,
        dd07vLookup,
        complicationLookup
      });

      if (therapy && documentKey && therapyIdByDocumentNumber) {
        therapyIdByDocumentNumber.set(documentKey, therapyID);
      }

      nextTherapyID += 1;

      return therapy;
    })
    .filter(Boolean);
}

function buildDiagnostics({
  tzesDiagRows,
  tzeyDiagRows,
  tzvsDiagRows,
  tzvyDiagRows,
  tzesRows,
  tzeyRows,
  tzvsRows,
  tzvyRows,
  validPatients,
  getNumericTumorId,
  dd07vLookup
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);

  const tzesByDocumentNumber = indexParentRowsByDocumentNumber(tzesRows);
  const tzeyByDocumentNumber = indexParentRowsByDocumentNumber(tzeyRows);
  const tzvsByDocumentNumber = indexParentRowsByDocumentNumber(tzvsRows);
  const tzvyByDocumentNumber = indexParentRowsByDocumentNumber(tzvyRows);

  const diagnosticsFromTzes = buildDiagnosticsFromRows({
    rows: tzesDiagRows,
    parentRowsByDocumentNumber: tzesByDocumentNumber,
    source: "tzes_diag",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const diagnosticsFromTzey = buildDiagnosticsFromRows({
    rows: tzeyDiagRows,
    parentRowsByDocumentNumber: tzeyByDocumentNumber,
    source: "tzey_diag",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const diagnosticsFromTzvs = buildDiagnosticsFromRows({
    rows: tzvsDiagRows,
    parentRowsByDocumentNumber: tzvsByDocumentNumber,
    source: "tzvs_diag",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const diagnosticsFromTzvy = buildDiagnosticsFromRows({
    rows: tzvyDiagRows,
    parentRowsByDocumentNumber: tzvyByDocumentNumber,
    source: "tzvy_diag",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  console.log(`Diagnostics aus tzes_diag: ${diagnosticsFromTzes.length}`);
  console.log(`Diagnostics aus tzey_diag: ${diagnosticsFromTzey.length}`);
  console.log(`Diagnostics aus tzvs_diag: ${diagnosticsFromTzvs.length}`);
  console.log(`Diagnostics aus tzvy_diag: ${diagnosticsFromTzvy.length}`);

  return [
    ...diagnosticsFromTzes,
    ...diagnosticsFromTzey,
    ...diagnosticsFromTzvs,
    ...diagnosticsFromTzvy
  ];
}

function buildDiagnosticsFromRows({
  rows,
  parentRowsByDocumentNumber,
  source,
  validPatientIds,
  getNumericTumorId,
  dd07vLookup
}) {
  return rows
    .map(row => {
      const documentNumber = getFirstValue(row, [
        "DOKNR",
        "doknr"
      ]);

      if (!documentNumber) {
        return null;
      }

      const documentKey = String(documentNumber).trim();
      const parentRow = parentRowsByDocumentNumber.get(documentKey);

      if (!parentRow) {
        return null;
      }

      const patID = getFirstValue(parentRow, [
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

      return mapDiagnostic(row, {
        parentRow,
        source,
        getNumericTumorId,
        dd07vLookup
      });
    })
    .filter(Boolean);
}

function buildProgresses({
  tzvsRows,
  tzvyRows,
  validPatients,
  getNumericTumorId,
  dd07vLookup
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);

  const progressFromTzvs = buildProgressesFromRows({
    rows: tzvsRows,
    sourceType: "tzvs",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const progressFromTzvy = buildProgressesFromRows({
    rows: tzvyRows,
    sourceType: "tzvy",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  console.log(`Progress aus tzvs: ${progressFromTzvs.length}`);
  console.log(`Progress aus tzvy: ${progressFromTzvy.length}`);

  return [
    ...progressFromTzvs,
    ...progressFromTzvy
  ];
}

function buildProgressesFromRows({
  rows,
  sourceType,
  validPatientIds,
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

      return mapProgress(row, {
        sourceType,
        getNumericTumorId,
        dd07vLookup
      });
    })
    .filter(Boolean);
}

function buildTnms({
  tzesRows,
  tzthRows,
  tzvsRows,
  validPatients,
  getNumericTumorId
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);

  const tnmFromTzes = buildTnmsFromRows({
    rows: tzesRows,
    sourceType: "tzes",
    validPatientIds,
    getNumericTumorId
  });

  const tnmFromTzth = buildTnmsFromRows({
    rows: tzthRows,
    sourceType: "tzth",
    validPatientIds,
    getNumericTumorId
  });

  const tnmFromTzvs = buildTnmsFromRows({
    rows: tzvsRows,
    sourceType: "tzvs",
    validPatientIds,
    getNumericTumorId
  });

  console.log(`TNM aus tzes: ${tnmFromTzes.length}`);
  console.log(`TNM aus tzth: ${tnmFromTzth.length}`);
  console.log(`TNM aus tzvs: ${tnmFromTzvs.length}`);

  return [
    ...tnmFromTzes,
    ...tnmFromTzth,
    ...tnmFromTzvs
  ];
}

function buildTnmsFromRows({
  rows,
  sourceType,
  validPatientIds,
  getNumericTumorId
}) {
  return rows
    .flatMap(row => {
      const patID = getFirstValue(row, [
        "TZ_P_PID",
        "PATID",
        "patid"
      ]);

      if (!patID) {
        return [];
      }

      const normalizedPatID = String(patID).trim();

      if (!validPatientIds.has(normalizedPatID)) {
        return [];
      }

      return mapTnmsForRow(row, {
        sourceType,
        getNumericTumorId
      });
    })
    .filter(Boolean);
}

function buildMetastases({
  tzesFmRows,
  tzvsFmRows,
  tzesRows,
  tzvsRows,
  validPatients,
  getNumericTumorId
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);

  const tzesByDocumentNumber = indexParentRowsByDocumentNumber(tzesRows);
  const tzvsByDocumentNumber = indexParentRowsByDocumentNumber(tzvsRows);

  const metastasesFromTzes = buildMetastasesFromRows({
    rows: tzesFmRows,
    parentRowsByDocumentNumber: tzesByDocumentNumber,
    source: "tzes_fm",
    validPatientIds,
    getNumericTumorId
  });

  const metastasesFromTzvs = buildMetastasesFromRows({
    rows: tzvsFmRows,
    parentRowsByDocumentNumber: tzvsByDocumentNumber,
    source: "tzvs_fm",
    validPatientIds,
    getNumericTumorId
  });

  console.log(`Metastasen aus tzes_fm: ${metastasesFromTzes.length}`);
  console.log(`Metastasen aus tzvs_fm: ${metastasesFromTzvs.length}`);

  return [
    ...metastasesFromTzes,
    ...metastasesFromTzvs
  ];
}

function buildMetastasesFromRows({
  rows,
  parentRowsByDocumentNumber,
  source,
  validPatientIds,
  getNumericTumorId
}) {
  return rows
    .map(row => {
      const documentNumber = getFirstValue(row, [
        "DOKNR",
        "doknr"
      ]);

      if (!documentNumber) {
        return null;
      }

      const documentKey = String(documentNumber).trim();
      const parentRow = parentRowsByDocumentNumber.get(documentKey);

      if (!parentRow) {
        return null;
      }

      const patID = getFirstValue(parentRow, [
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

      return mapMetastasis(row, {
        parentRow,
        source,
        getNumericTumorId
      });
    })
    .filter(Boolean)
    .filter(metastasis => {
      /**
       * Keine komplett leeren Metastasen schreiben.
       */
      return Boolean(
        metastasis.tumorID ||
        metastasis.metastasisLocation ||
        metastasis.metastasisDate
      );
    });
}

function buildTumorBoards({
  tzesTbRows,
  tzvsTbRows,
  tzeyRows,
  validPatients,
  getNumericTumorId,
  dd07vLookup
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);

  const tumorBoardsFromTzesTb = buildTumorBoardsFromRows({
    rows: tzesTbRows,
    sourceType: "tzes_tb",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const tumorBoardsFromTzvsTb = buildTumorBoardsFromRows({
    rows: tzvsTbRows,
    sourceType: "tzvs_tb",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const tumorBoardsFromTzey = buildTumorBoardsFromRows({
    rows: tzeyRows,
    sourceType: "tzey",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  console.log(`Tumorboards aus tzes_tb: ${tumorBoardsFromTzesTb.length}`);
  console.log(`Tumorboards aus tzvs_tb: ${tumorBoardsFromTzvsTb.length}`);
  console.log(`Tumorboards aus tzey: ${tumorBoardsFromTzey.length}`);

  return [
    ...tumorBoardsFromTzesTb,
    ...tumorBoardsFromTzvsTb,
    ...tumorBoardsFromTzey
  ];
}

function buildTumorBoardsFromRows({
  rows,
  sourceType,
  validPatientIds,
  getNumericTumorId,
  dd07vLookup
}) {
  return rows
    .flatMap(row => {
      const patID = getFirstValue(row, [
        "TZ_P_PID",
        "PATID",
        "patid"
      ]);

      if (!patID) {
        return [];
      }

      const normalizedPatID = String(patID).trim();

      if (!validPatientIds.has(normalizedPatID)) {
        return [];
      }

      return mapTumorBoardsForRow(row, {
        sourceType,
        getNumericTumorId,
        dd07vLookup
      });
    })
    .filter(Boolean);
}

function buildConsultations({
  tzesBrRows,
  tzeyBrRows,
  tzvsBrRows,
  tzvyBrRows,
  tzesRows,
  tzeyRows,
  tzvsRows,
  tzvyRows,
  validPatients,
  getNumericTumorId,
  dd07vLookup
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);

  const tzesByDocumentNumber = indexParentRowsByDocumentNumber(tzesRows);
  const tzeyByDocumentNumber = indexParentRowsByDocumentNumber(tzeyRows);
  const tzvsByDocumentNumber = indexParentRowsByDocumentNumber(tzvsRows);
  const tzvyByDocumentNumber = indexParentRowsByDocumentNumber(tzvyRows);

  const consultationsFromTzes = buildConsultationsFromRows({
    rows: tzesBrRows,
    parentRowsByDocumentNumber: tzesByDocumentNumber,
    source: "tzes_br",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const consultationsFromTzey = buildConsultationsFromRows({
    rows: tzeyBrRows,
    parentRowsByDocumentNumber: tzeyByDocumentNumber,
    source: "tzey_br",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const consultationsFromTzvs = buildConsultationsFromRows({
    rows: tzvsBrRows,
    parentRowsByDocumentNumber: tzvsByDocumentNumber,
    source: "tzvs_br",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  const consultationsFromTzvy = buildConsultationsFromRows({
    rows: tzvyBrRows,
    parentRowsByDocumentNumber: tzvyByDocumentNumber,
    source: "tzvy_br",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup
  });

  console.log(`Consultations aus tzes_br: ${consultationsFromTzes.length}`);
  console.log(`Consultations aus tzey_br: ${consultationsFromTzey.length}`);
  console.log(`Consultations aus tzvs_br: ${consultationsFromTzvs.length}`);
  console.log(`Consultations aus tzvy_br: ${consultationsFromTzvy.length}`);

  return [
    ...consultationsFromTzes,
    ...consultationsFromTzey,
    ...consultationsFromTzvs,
    ...consultationsFromTzvy
  ];
}

function buildConsultationsFromRows({
  rows,
  parentRowsByDocumentNumber,
  source,
  validPatientIds,
  getNumericTumorId,
  dd07vLookup
}) {
  return rows
    .map(row => {
      const documentNumber = getFirstValue(row, [
        "DOKNR",
        "doknr"
      ]);

      if (!documentNumber) {
        return null;
      }

      const documentKey = String(documentNumber).trim();
      const parentRow = parentRowsByDocumentNumber.get(documentKey);

      if (!parentRow) {
        return null;
      }

      const patID = getFirstValue(parentRow, [
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

      return mapConsultation(row, {
        parentRow,
        source,
        getNumericTumorId,
        dd07vLookup
      });
    })
    .filter(Boolean);
}

function buildSupplementaries({
  tzesKlRows,
  tzeyKlRows,
  tzvsKlRows,
  tzvyKlRows,
  tzthKlRows,
  tzesZaRows,
  tzeyZaRows,
  tzvsZaRows,
  tzvyZaRows,
  tzthZaRows,
  tzesRows,
  tzeyRows,
  tzvsRows,
  tzvyRows,
  tzthRows,
  validPatients,
  getNumericTumorId
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);

  const tzesByDocumentNumber = indexParentRowsByDocumentNumber(tzesRows);
  const tzeyByDocumentNumber = indexParentRowsByDocumentNumber(tzeyRows);
  const tzvsByDocumentNumber = indexParentRowsByDocumentNumber(tzvsRows);
  const tzvyByDocumentNumber = indexParentRowsByDocumentNumber(tzvyRows);
  const tzthByDocumentNumber = indexParentRowsByDocumentNumber(tzthRows);

  const supplementaryFromTzes = buildSupplementariesFromRows({
    rows: tzesKlRows,
    parentRowsByDocumentNumber: tzesByDocumentNumber,
    source: "tzes_kl",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzey = buildSupplementariesFromRows({
    rows: tzeyKlRows,
    parentRowsByDocumentNumber: tzeyByDocumentNumber,
    source: "tzey_kl",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzvs = buildSupplementariesFromRows({
    rows: tzvsKlRows,
    parentRowsByDocumentNumber: tzvsByDocumentNumber,
    source: "tzvs_kl",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzvy = buildSupplementariesFromRows({
    rows: tzvyKlRows,
    parentRowsByDocumentNumber: tzvyByDocumentNumber,
    source: "tzvy_kl",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzth = buildSupplementariesFromRows({
    rows: tzthKlRows,
    parentRowsByDocumentNumber: tzthByDocumentNumber,
    source: "tzth_kl",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzesZa = buildSupplementariesFromRows({
    rows: tzesZaRows,
    parentRowsByDocumentNumber: tzesByDocumentNumber,
    source: "tzes_za",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzeyZa = buildSupplementariesFromRows({
    rows: tzeyZaRows,
    parentRowsByDocumentNumber: tzeyByDocumentNumber,
    source: "tzey_za",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzvsZa = buildSupplementariesFromRows({
    rows: tzvsZaRows,
    parentRowsByDocumentNumber: tzvsByDocumentNumber,
    source: "tzvs_za",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzvyZa = buildSupplementariesFromRows({
    rows: tzvyZaRows,
    parentRowsByDocumentNumber: tzvyByDocumentNumber,
    source: "tzvy_za",
    validPatientIds,
    getNumericTumorId
  });

  const supplementaryFromTzthZa = buildSupplementariesFromRows({
    rows: tzthZaRows,
    parentRowsByDocumentNumber: tzthByDocumentNumber,
    source: "tzth_za",
    validPatientIds,
    getNumericTumorId
  });

  console.log(`Supplementaries aus tzes_kl: ${supplementaryFromTzes.length}`);
  console.log(`Supplementaries aus tzey_kl: ${supplementaryFromTzey.length}`);
  console.log(`Supplementaries aus tzvs_kl: ${supplementaryFromTzvs.length}`);
  console.log(`Supplementaries aus tzvy_kl: ${supplementaryFromTzvy.length}`);
  console.log(`Supplementaries aus tzth_kl: ${supplementaryFromTzth.length}`);
  console.log(`Supplementaries aus tzes_za: ${supplementaryFromTzesZa.length}`);
  console.log(`Supplementaries aus tzey_za: ${supplementaryFromTzeyZa.length}`);
  console.log(`Supplementaries aus tzvs_za: ${supplementaryFromTzvsZa.length}`);
  console.log(`Supplementaries aus tzvy_za: ${supplementaryFromTzvyZa.length}`);
  console.log(`Supplementaries aus tzth_za: ${supplementaryFromTzthZa.length}`);

  return [
    ...supplementaryFromTzes,
    ...supplementaryFromTzey,
    ...supplementaryFromTzvs,
    ...supplementaryFromTzvy,
    ...supplementaryFromTzth,
    ...supplementaryFromTzesZa,
    ...supplementaryFromTzeyZa,
    ...supplementaryFromTzvsZa,
    ...supplementaryFromTzvyZa,
    ...supplementaryFromTzthZa
  ];
}

function buildSupplementariesFromRows({
  rows,
  parentRowsByDocumentNumber,
  source,
  validPatientIds,
  getNumericTumorId
}) {
  return rows
    .map(row => {
      const documentNumber = getFirstValue(row, [
        "DOKNR",
        "doknr"
      ]);

      if (!documentNumber) {
        return null;
      }

      const documentKey = String(documentNumber).trim();
      const parentRow = parentRowsByDocumentNumber.get(documentKey);

      if (!parentRow) {
        return null;
      }

      const patID = getFirstValue(parentRow, [
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

      return mapSupplementary(row, {
        parentRow,
        source,
        getNumericTumorId
      });
    })
    .filter(Boolean);
}


function buildMolecularMarkers({
  tzesGenRows,
  tzeyGenRows,
  tzvsGenRows,
  tzvyGenRows,
  tzesRows,
  tzeyRows,
  tzvsRows,
  tzvyRows,
  validPatients,
  getNumericTumorId,
  dd07vLookup,
  molecularMarkerLookup
}) {
  const validPatientIds = createValidPatientIdSet(validPatients);

  const tzesByDocumentNumber = indexParentRowsByDocumentNumber(tzesRows);
  const tzeyByDocumentNumber = indexParentRowsByDocumentNumber(tzeyRows);
  const tzvsByDocumentNumber = indexParentRowsByDocumentNumber(tzvsRows);
  const tzvyByDocumentNumber = indexParentRowsByDocumentNumber(tzvyRows);

  const molecularMarkersFromTzes = buildMolecularMarkersFromRows({
    rows: tzesGenRows,
    parentRowsByDocumentNumber: tzesByDocumentNumber,
    source: "tzes_gen",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup,
    molecularMarkerLookup
  });

  const molecularMarkersFromTzey = buildMolecularMarkersFromRows({
    rows: tzeyGenRows,
    parentRowsByDocumentNumber: tzeyByDocumentNumber,
    source: "tzey_gen",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup,
    molecularMarkerLookup
  });

  const molecularMarkersFromTzvs = buildMolecularMarkersFromRows({
    rows: tzvsGenRows,
    parentRowsByDocumentNumber: tzvsByDocumentNumber,
    source: "tzvs_gen",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup,
    molecularMarkerLookup
  });

  const molecularMarkersFromTzvy = buildMolecularMarkersFromRows({
    rows: tzvyGenRows,
    parentRowsByDocumentNumber: tzvyByDocumentNumber,
    source: "tzvy_gen",
    validPatientIds,
    getNumericTumorId,
    dd07vLookup,
    molecularMarkerLookup
  });

  console.log(`Molecular Marker aus tzes_gen: ${molecularMarkersFromTzes.length}`);
  console.log(`Molecular Marker aus tzey_gen: ${molecularMarkersFromTzey.length}`);
  console.log(`Molecular Marker aus tzvs_gen: ${molecularMarkersFromTzvs.length}`);
  console.log(`Molecular Marker aus tzvy_gen: ${molecularMarkersFromTzvy.length}`);

  return [
    ...molecularMarkersFromTzes,
    ...molecularMarkersFromTzey,
    ...molecularMarkersFromTzvs,
    ...molecularMarkersFromTzvy
  ];
}

function buildMolecularMarkersFromRows({
  rows,
  parentRowsByDocumentNumber,
  source,
  validPatientIds,
  getNumericTumorId,
  dd07vLookup,
  molecularMarkerLookup
}) {
  return rows
    .map(row => {
      const documentNumber = getFirstValue(row, [
        "DOKNR",
        "doknr"
      ]);

      if (!documentNumber) {
        return null;
      }

      const documentKey = String(documentNumber).trim();
      const parentRow = parentRowsByDocumentNumber.get(documentKey);

      if (!parentRow) {
        return null;
      }

      const patID = getFirstValue(parentRow, [
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

      return mapMolecularMarker(row, {
        parentRow,
        source,
        getNumericTumorId,
        dd07vLookup,
        molecularMarkerLookup
      });
    })
    .filter(Boolean);
}


function buildSingleRadiations({
  tzthStrRows,
  tzthRows,
  therapyIdByDocumentNumber,
  dd07vLookup
}) {
  const tzthByDocumentNumber = indexParentRowsByDocumentNumber(tzthRows);

  const singleRadiations = tzthStrRows
    .map(row => {
      const documentNumber = getFirstValue(row, [
        "DOKNR",
        "doknr"
      ]);

      if (!documentNumber) {
        return null;
      }

      const documentKey = String(documentNumber).trim();
      const parentTherapyRow = tzthByDocumentNumber.get(documentKey);
      const therapyID = therapyIdByDocumentNumber.get(documentKey);

      if (!parentTherapyRow || !therapyID) {
        return null;
      }

      return mapSingleRadiation(row, {
        parentTherapyRow,
        therapyID,
        dd07vLookup
      });
    })
    .filter(Boolean);

  console.log(`Single Radiations aus tzth_str: ${singleRadiations.length}`);

  return singleRadiations;
}

function indexParentRowsByDocumentNumber(rows) {
  const index = new Map();

  for (const row of rows) {
    const documentNumber = getFirstValue(row, [
      "DOKNR",
      "doknr"
    ]);

    if (!documentNumber) {
      continue;
    }

    const documentKey = String(documentNumber).trim();

    if (!index.has(documentKey)) {
      index.set(documentKey, row);
    }
  }

  return index;
}

function createValidPatientIdSet(validPatients) {
  return new Set(
    validPatients
      .map(patient => patient.patID)
      .filter(Boolean)
      .map(patID => String(patID).trim())
  );
}

function indexRowsByDocumentNumber(rows) {
  const index = new Map();

  for (const row of rows) {
    const documentNumber = getFirstValue(row, [
      "DOKNR",
      "doknr"
    ]);

    if (!documentNumber) {
      continue;
    }

    const documentKey = String(documentNumber).trim();

    if (!index.has(documentKey)) {
      index.set(documentKey, []);
    }

    index.get(documentKey).push(row);
  }

  return index;
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
