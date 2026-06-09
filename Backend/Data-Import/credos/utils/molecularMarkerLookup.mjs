// utils/molecularMarkerLookup.mjs
import { parseCredosDollarFile } from "../credosDollarParser.mjs";

/**
 * Lookup für molekulare Marker aus den CREDOS-Stammdatendateien.
 *
 * Erwartete Dateien im Export-Ordner:
 * - zn2crgenenquiry.txt  => Untersuchungsmethoden, z.B. NGS/FISH/IHC
 * - zn2crgenclasses.txt  => Marker/Gene, z.B. EGFR/ALK/BRAF
 * - zn2crgenstages.txt   => Varianten/Stadien je Marker, z.B. Exon 18, BRAF-V600
 * - zn2crgeninfo.txt     => Zusatzinfos je Marker, z.B. Aktivierend/Nicht aktivierend
 *
 * Alle Dateien sind optional. Wenn eine Datei fehlt oder ein Wert nicht gefunden wird,
 * wird auf den ursprünglichen Code/Freitext zurückgefallen.
 */
export async function createMolecularMarkerLookup({
  enquiryFile,
  classesFile,
  stagesFile,
  infoFile
} = {}) {
  const enquiryRows = await parseOptionalCredosFile(enquiryFile);
  const classRows = await parseOptionalCredosFile(classesFile);
  const stageRows = await parseOptionalCredosFile(stagesFile);
  const infoRows = await parseOptionalCredosFile(infoFile);

  const methodsByCode = new Map();
  const classesByCode = new Map();
  const stagesByClassAndStage = new Map();
  const stagesByStage = new Map();
  const infosByClassAndInfo = new Map();
  const infosByInfo = new Map();

  for (const row of enquiryRows) {
    const code = getFirstValue(row, [
      "GEN_UNTERSUCHUNG",
      "TZ_GEN_UNT",
      "UNTERSUCHUNG",
      "METHOD",
      "CODE"
    ]);

    if (!code) {
      continue;
    }

    methodsByCode.set(normalizeKey(code), row);
  }

  for (const row of classRows) {
    const code = getFirstValue(row, [
      "ZN2CLASS",
      "ZN2_CLASS",
      "TZ_GEN_NAM",
      "GEN_NAM",
      "CLASS",
      "CODE"
    ]);

    if (!code) {
      continue;
    }

    classesByCode.set(normalizeKey(code), row);
  }

  for (const row of stageRows) {
    const classCode = getFirstValue(row, [
      "ZN2CLASS",
      "ZN2_CLASS",
      "TZ_GEN_NAM",
      "GEN_NAM",
      "CLASS"
    ]);

    const stageCode = getFirstValue(row, [
      "ZN2STAGE",
      "ZN2_STAGE",
      "TZ_GEN_VAR",
      "GEN_VAR",
      "STAGE",
      "VARIANT",
      "CODE"
    ]);

    if (!stageCode) {
      continue;
    }

    const normalizedStage = normalizeKey(stageCode);

    if (classCode) {
      const key = buildCompositeKey(classCode, stageCode);

      if (!stagesByClassAndStage.has(key)) {
        stagesByClassAndStage.set(key, row);
      }
    }

    if (!stagesByStage.has(normalizedStage)) {
      stagesByStage.set(normalizedStage, row);
    }
  }

  for (const row of infoRows) {
    const classCode = getFirstValue(row, [
      "ZN2CLASS",
      "ZN2_CLASS",
      "TZ_GEN_NAM",
      "GEN_NAM",
      "CLASS"
    ]);

    const infoCode = getFirstValue(row, [
      "ZN2GENINFO",
      "ZN2_GENINFO",
      "TZ_GEN_SON",
      "GEN_SON",
      "INFO",
      "CODE"
    ]);

    if (!infoCode) {
      continue;
    }

    const normalizedInfo = normalizeKey(infoCode);

    if (classCode) {
      const key = buildCompositeKey(classCode, infoCode);

      if (!infosByClassAndInfo.has(key)) {
        infosByClassAndInfo.set(key, row);
      }
    }

    if (!infosByInfo.has(normalizedInfo)) {
      infosByInfo.set(normalizedInfo, row);
    }
  }

  return {
    resolveMethod(code, options = {}) {
      const { fallbackToCode = true } = options;
      const normalizedCode = normalizeKey(code);

      if (!normalizedCode) {
        return null;
      }

      const row = methodsByCode.get(normalizedCode);
      const text = row
        ? getFirstValue(row, [
            "GEN_UNTERSUCHUNG_TXT",
            "UNTERSUCHUNG_TXT",
            "METHOD_TXT",
            "TEXT",
            "DDTEXT"
          ])
        : null;

      return emptyToNull(text) ?? (fallbackToCode ? String(code).trim() : null);
    },

    resolveMarker(code, options = {}) {
      const { fallbackToCode = true } = options;
      const normalizedCode = normalizeKey(code);

      if (!normalizedCode) {
        return null;
      }

      const row = classesByCode.get(normalizedCode);
      const text = row
        ? getFirstValue(row, [
            "ZN2CLASSTXT",
            "ZN2_CLASS_TXT",
            "ZN2CLASSTEXT",
            "CLASSTXT",
            "CLASSTEXT",
            "TEXT",
            "DDTEXT"
          ])
        : null;

      return emptyToNull(text) ?? (fallbackToCode ? String(code).trim() : null);
    },

    resolveVariant(markerCode, variantCode, options = {}) {
      const { fallbackToCode = true } = options;
      const normalizedVariant = normalizeKey(variantCode);

      if (!normalizedVariant) {
        return null;
      }

      const key = markerCode
        ? buildCompositeKey(markerCode, variantCode)
        : null;

      const row = key
        ? stagesByClassAndStage.get(key) ?? stagesByStage.get(normalizedVariant)
        : stagesByStage.get(normalizedVariant);

      const text = row
        ? cleanLookupText(getFirstValue(row, [
            "ZN2STAGETXT",
            "ZN2_STAGE_TXT",
            "ZN2STAGETEXT",
            "STAGETXT",
            "STAGETEXT",
            "TEXT",
            "DDTEXT"
          ]))
        : null;

      return emptyToNull(text) ?? (fallbackToCode ? String(variantCode).trim() : null);
    },

    resolveInfo(markerCode, infoCode, options = {}) {
      const { fallbackToCode = true } = options;
      const normalizedInfo = normalizeKey(infoCode);

      if (!normalizedInfo) {
        return null;
      }

      const key = markerCode
        ? buildCompositeKey(markerCode, infoCode)
        : null;

      const row = key
        ? infosByClassAndInfo.get(key) ?? infosByInfo.get(normalizedInfo)
        : infosByInfo.get(normalizedInfo);

      const text = row
        ? getFirstValue(row, [
            "ZN2GENINFO_TXT",
            "ZN2_GENINFO_TXT",
            "GENINFO_TXT",
            "INFOTXT",
            "TEXT",
            "DDTEXT"
          ])
        : null;

      return emptyToNull(text) ?? (fallbackToCode ? String(infoCode).trim() : null);
    }
  };
}

async function parseOptionalCredosFile(filePath) {
  if (!filePath) {
    return [];
  }

  try {
    return await parseCredosDollarFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`Optionale molekulare Lookup-Datei nicht gefunden: ${filePath}`);
      return [];
    }

    throw error;
  }
}

function buildCompositeKey(first, second) {
  return `${normalizeKey(first)}|${normalizeKey(second)}`;
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

function normalizeKey(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  return normalized.toUpperCase();
}

function cleanLookupText(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  /**
   * In einigen Stammdatendateien kommen reine Trenner-/Hinweiszeilen vor.
   * Solche Zeilen sollen keinen fachlichen Wert überschreiben.
   */
  if (/^\*+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function emptyToNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}
