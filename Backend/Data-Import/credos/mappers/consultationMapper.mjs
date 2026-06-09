// mappers/consultationMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock consultation-Ressource aus:
 * - tzes_br.txt
 * - tzey_br.txt
 * - tzvs_br.txt
 * - tzvy_br.txt
 *
 * Die Beratungszeilen werden über DOKNR an tzes/tzey/tzvs/tzvy gebunden.
 *
 * Zielstruktur:
 * {
 *   tumorID,
 *   status,
 *   type,
 *   consultationOccurrenceDate
 * }
 */
export function mapConsultation(consultationRow, context = {}) {
  const {
    parentRow,
    source,
    getNumericTumorId,
    dd07vLookup
  } = context;

  const tumorIdRaw = getFirstValue(parentRow ?? {}, [
    "TZ_T_TID",
    "tumorid",
    "TUMORID"
  ]);

  const statusRaw = getFirstValue(consultationRow, [
    "TZ_BERSTAT",
    "BERSTAT"
  ]);

  const typeRaw = getFirstValue(consultationRow, [
    "TZ_BERART",
    "BERART"
  ]);

  const dateRaw = getFirstValue(consultationRow, [
    "TZ_BERDATE",
    "BERDATE"
  ]);

  const statusResolved = resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZ_BERSTAT",
      "TZ_BERSTAT"
    ],
    statusRaw
  );

  const typeResolved = resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZ_BERART",
      "TZ_BERART"
    ],
    typeRaw
  );

  const consultation = {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    status: mapConsultationStatus(statusResolved),

    type: mapConsultationType(typeResolved),

    consultationOccurrenceDate: toOptionalCredosIsoDateOrNull(
      dateRaw,
      `${source ?? "consultation"}.TZ_BERDATE`
    )
  };

  /**
   * Keine komplett leeren Beratungen schreiben.
   * tumorID alleine reicht nicht.
   */
  if (
    !consultation.status &&
    !consultation.type &&
    !consultation.consultationOccurrenceDate
  ) {
    return null;
  }

  return consultation;
}

function mapConsultationStatus(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();

  if (
    upper.includes("DURCHGEF") ||
    upper.includes("DURCHGEFÜHRT") ||
    upper === "D"
  ) {
    return "Durchgeführt";
  }

  return normalized;
}

function mapConsultationType(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();

  /**
   * Erste grobe Normalisierung auf omock-Werte.
   * Alles Unbekannte bleibt erstmal Originalwert.
   */
  if (
    lower.includes("ernähr") ||
    lower.includes("ernaehr") ||
    lower.includes("nutrition")
  ) {
    return "nutrition";
  }

  if (
    lower.includes("sozial") ||
    lower.includes("social")
  ) {
    return "social";
  }

  if (
    lower.includes("psycho") ||
    lower.includes("psych")
  ) {
    return "psychooncology";
  }

  if (
    lower.includes("genet") ||
    lower.includes("humangen")
  ) {
    return "genetic";
  }

  return normalized;
}

function resolveDd07vValue(dd07vLookup, domainNames, code) {
  if (code === null || code === undefined || code === "") {
    return null;
  }

  if (!dd07vLookup) {
    return String(code).trim();
  }

  return dd07vLookup.resolve(domainNames, code, {
    fallbackToCode: true
  });
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

function emptyToNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const trimmed = String(value).trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return null;
}
