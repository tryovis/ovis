// mappers/supplementaryMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock supplementary-Ressource aus:
 * - *_kl.txt = Klassifikationen/Stadien
 * - *_za.txt = Zusatzangaben
 *
 * Beide Varianten werden über DOKNR an das jeweilige Parent-Dokument
 * tzes/tzvs/tzey/tzvy/tzth gebunden.
 *
 * Zielstruktur:
 * {
 *   tumorID,
 *   type,
 *   status,
 *   source,
 *   supplementaryOccurrenceDate
 * }
 */
export function mapSupplementary(supplementaryRow, context = {}) {
  const {
    parentRow,
    source,
    getNumericTumorId
  } = context;

  const tumorIdRaw = getFirstValue(parentRow ?? {}, [
    "TZ_T_TID",
    "tumorid",
    "TUMORID"
  ]);

  const typeRaw = getFirstValue(supplementaryRow, [
    "TZ_K_KLAS",
    "tz_k_klas",
    "TZ_ZA_KLAS",
    "tz_za_klas"
  ]);

  const statusRaw = getFirstValue(supplementaryRow, [
    "TZ_K_STAD",
    "tz_k_stad",
    "TZ_ZA_STAD",
    "tz_za_stad"
  ]);

  const dateRaw = getFirstValue(supplementaryRow, [
    "TZ_K_KL_DA",
    "tz_k_kl_da",
    "TZ_ZA_KL_D",
    "tz_za_kl_d"
  ]);

  const dateFieldName = hasAnyValue(supplementaryRow, [
    "TZ_ZA_KL_D",
    "tz_za_kl_d"
  ])
    ? "TZ_ZA_KL_D"
    : "TZ_K_KL_DA";

  const type = mapSupplementaryType(typeRaw);
  const status = emptyToNull(statusRaw);

  /**
   * Keine leeren supplementary-Zeilen schreiben.
   * Gerade in *_kl und *_za gibt es technische Zeilen mit DOKNR/MUSEQ,
   * aber ohne eigentliche Klassifikation/Zusatzangabe.
   *
   * Für supplementary ist tumorID/source/date alleine nicht fachlich genug.
   * Deshalb laden wir nur Zeilen, in denen mindestens type oder status
   * befüllt ist.
   */
  if (!type && !status) {
    return null;
  }

  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    type,

    status,

    source: source ?? null,

    supplementaryOccurrenceDate: toOptionalCredosIsoDateOrNull(
      dateRaw,
      `${source ?? "supplementary"}.${dateFieldName}`
    )
  };
}

function mapSupplementaryType(value) {
  return emptyToNull(value);
}

function getFirstValue(row, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = row[fieldName];
    const normalized = emptyToNull(value);

    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function hasAnyValue(row, fieldNames) {
  return fieldNames.some(fieldName => emptyToNull(row[fieldName]) !== null);
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
