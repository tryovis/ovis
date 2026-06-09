// utils/complicationLookup.mjs
import { parseCredosDollarFile } from "../credosDollarParser.mjs";

/**
 * Lookup für Komplikationsklassen und stadienspezifische Texte.
 *
 * Erwartete Dateien:
 * - zn2crkomplclas.txt
 * - zn2crkomplsstag.txt
 *
 * Der Parser ist bewusst tolerant, weil die konkreten Header je nach Export
 * leicht unterschiedlich sein können.
 */
export async function createComplicationLookup({
  classesFile,
  stagesFile
}) {
  const classRows = classesFile
    ? await parseCredosDollarFile(classesFile)
    : [];

  const stageRows = stagesFile
    ? await parseCredosDollarFile(stagesFile)
    : [];

  const classesByCode = new Map();
  const stagesByClassAndStage = new Map();
  const stagesByStage = new Map();

  for (const row of classRows) {
    const code = getFirstValue(row, [
      "ZN2CLASS",
      "ZN2_CLASS",
      "CLASS",
      "KLASSE",
      "CODE"
    ]);

    if (!code) {
      continue;
    }

    const normalizedCode = normalizeKey(code);

    if (!classesByCode.has(normalizedCode)) {
      classesByCode.set(normalizedCode, row);
    }
  }

  for (const row of stageRows) {
    const classCode = getFirstValue(row, [
      "ZN2CLASS",
      "ZN2_CLASS",
      "CLASS",
      "KLASSE",
      "CODE"
    ]);

    const stageCode = getFirstValue(row, [
      "ZN2STAGE",
      "ZN2_STAGE",
      "STAGE",
      "GRAD",
      "GRADE"
    ]);

    if (!stageCode) {
      continue;
    }

    const normalizedStage = normalizeKey(stageCode);

    if (classCode) {
      const key = `${normalizeKey(classCode)}|${normalizedStage}`;

      if (!stagesByClassAndStage.has(key)) {
        stagesByClassAndStage.set(key, row);
      }
    }

    if (!stagesByStage.has(normalizedStage)) {
      stagesByStage.set(normalizedStage, row);
    }
  }

  return {
    resolveClass(code, options = {}) {
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

    resolveStage(classCode, stageCode, options = {}) {
      const { fallbackToCode = true } = options;
      const normalizedStage = normalizeKey(stageCode);

      if (!normalizedStage) {
        return null;
      }

      const key = classCode
        ? `${normalizeKey(classCode)}|${normalizedStage}`
        : null;

      const row = key
        ? stagesByClassAndStage.get(key) ?? stagesByStage.get(normalizedStage)
        : stagesByStage.get(normalizedStage);

      const text = row
        ? getFirstValue(row, [
            "ZN2STAGTXT",
            "ZN2_STAGE_TXT",
            "ZN2STAGETXT",
            "STAGETXT",
            "STAGETEXT",
            "TEXT",
            "DDTEXT"
          ])
        : null;

      return emptyToNull(text) ?? (fallbackToCode ? String(stageCode).trim() : null);
    },

    resolveStandard(classCode, stageCode) {
      const stage = emptyToNull(stageCode);
      const classValue = emptyToNull(classCode);
      const combined = `${stage ?? ""} ${classValue ?? ""}`.toUpperCase();

      if (combined.includes("CLD") || combined.includes("CLAVIEN")) {
        return "Clavien-Dindo";
      }

      if (combined.includes("CTC") || combined.includes("CTCAE")) {
        return "CTCAE";
      }

      return "CTCAE";
    }
  };
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

function emptyToNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}
