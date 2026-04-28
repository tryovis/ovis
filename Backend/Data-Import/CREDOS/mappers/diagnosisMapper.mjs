// mappers/diagnosisMapper.mjs
import { toCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock diagnosis-Ressource aus tzes.txt.
 *
 * Aktueller Stand:
 * - zentrale Diagnosewerte kommen aus tzes.txt
 * - tumorID muss numerisch sein
 * - echte numerische TZ_T_TID werden übernommen
 * - nicht-numerische Test-IDs/Hashes werden über getNumericTumorId ersetzt
 */
export function mapDiagnosis(tzesRow, context = {}) {
  const { getNumericTumorId } = context;

  const diagnosisDate = toCredosIsoDateOrNull(tzesRow.TZE_D_DIAD);

  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tzesRow.TZ_T_TID)
      : numericOrNull(tzesRow.TZ_T_TID),

    primaryCase: mapYesNo(tzesRow.TZE_PFALL),

    diagnosisDate,

    ICDO_histologyCode: tzesRow.TZE_D_HISK ?? null,
    ICDO_histologyCodeText: null,

    ICDO_histologyDate: diagnosisDate,

    ICDO_localizationCode: tzesRow.TZE_D_ICDO ?? null,
    ICDO_localizationCodeText: null,

    ICD_ICD10: tzesRow.TZE_D_LOK ?? null,
    ICD_ICD10Text: null,

    diagnosisAssurance: null,
    diagnosisReason: null,

    side: normalizeSide(tzesRow.TZES_D_SEI),

    hasMetastasis: 0,

    reportDate: null,
    reportID: null,

    patID: tzesRow.TZ_P_PID ? String(tzesRow.TZ_P_PID).trim() : null,

    centerCase: null,
    organizationalUnit: null,

    internal: "Meine Einrichtung"
  };
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

function mapYesNo(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["j", "ja", "1", "true", "y", "yes"].includes(normalized)) {
    return "Ja";
  }

  if (["n", "nein", "0", "false", "no"].includes(normalized)) {
    return "Nein";
  }

  return String(value).trim();
}

function normalizeSide(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value).trim();
}