// mappers/diagnosisMapper.mjs
import {
  toOptionalCredosIsoDateOrNull,
  toRequiredCredosIsoDateOrNull
} from "../utils/dates.mjs";

/**
 * Baut eine omock diagnosis-Ressource aus:
 * - tzes.txt als Hauptquelle für solide Tumoren
 * - tzey.txt als Hauptquelle für systemische Tumoren
 * - tzvs.txt als Verlauf für solide Tumoren
 * - tzvy.txt als Verlauf für systemische Tumoren
 * - tzti.txt für organizationalUnit und internal
 *
 * Aktueller Stand:
 * - zentrale Diagnosewerte kommen aus tzes.txt oder tzey.txt
 * - tumorID muss numerisch sein
 * - echte numerische TZ_T_TID werden übernommen
 * - nicht-numerische Test-IDs/Hashes werden über getNumericTumorId ersetzt
 * - Kürzel werden über dd07v.txt aufgelöst, wenn ein Lookup vorhanden ist
 */
export function mapDiagnosis(row, context = {}) {
  const {
    sourceType,
    centerCaseRow,
    tztiRow,
    getNumericTumorId,
    dd07vLookup
  } = context;

  const diagnosisDateRaw = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_D_DIAD",

    /**
     * TZEY
     */
    "TZEY_D_DIAD",
    "TZY_D_DIAD",
    "TZEY_DIAD",
    "DIAD"
  ]);

  const diagnosisDate = toRequiredCredosIsoDateOrNull(
    diagnosisDateRaw,
    `${sourceType ?? "diagnosis"}.diagnosisDate`
  );

  /**
   * reportDate ist optional.
   * Falls TZ_LKR_MDA in Testdaten Hashes/IDs enthält, wird daraus null.
   */
  const reportDateRaw = getFirstValue(row, [
    "TZ_LKR_MDA",
    "LKR_MDA"
  ]);

  const reportDate = toOptionalCredosIsoDateOrNull(
    reportDateRaw,
    `${sourceType ?? "diagnosis"}.reportDate`
  );

  const tumorIdRaw = getFirstValue(row, [
    "TZ_T_TID",
    "tumorid",
    "TUMORID"
  ]);

  const primaryCaseRaw = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_PFALL",

    /**
     * TZEY
     */
    "TZEY_PFALL",
    "TZY_PFALL",
    "PFALL"
  ]);

  const histologyCode = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_D_HIS",

    /**
     * TZEY
     */
    "TZEY_D_HIS",
    "TZY_D_HIS",

    /**
     * Fallback alt
     */
    "TZE_D_HISK"
  ]);

  const histologyText = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_D_HIST",

    /**
     * TZEY
     */
    "TZEY_D_HIST",
    "TZY_D_HIST"
  ]);

  const icdoLocalizationCode = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_D_ICDO",

    /**
     * TZEY
     */
    "TZEY_D_ICDO",
    "TZY_D_ICDO"
  ]);

  const icdoLocalizationText = getFirstValue(row, [
    /**
     * TZES
     */
    "TZED_ICDOT",

    /**
     * TZEY
     */
    "TZEY_ICDOT",
    "TZY_ICDOT"
  ]);

  const icd10Code = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_D_LOK",

    /**
     * TZEY
     */
    "TZEY_D_LOK",
    "TZY_D_LOK"
  ]);

  const icd10Text = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_D_LOKT",

    /**
     * TZEY
     */
    "TZEY_D_LOKT",
    "TZY_D_LOKT"
  ]);

  const diagnosisAssuranceRaw = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_D_DIAS",

    /**
     * TZEY
     */
    "TZEY_D_DIAS",
    "TZY_D_DIAS"
  ]);

  const diagnosisReasonRaw = getFirstValue(row, [
    /**
     * TZES
     */
    "TZE_D_DIAA",

    /**
     * TZEY
     */
    "TZEY_D_DIAA",
    "TZY_D_DIAA"
  ]);

  const sideRaw = getFirstValue(row, [
    /**
     * TZES
     */
    "TZES_D_SEI",

    /**
     * TZEY
     */
    "TZEY_D_SEI",
    "TZY_D_SEI"
  ]);

  const metastasisRaw = getFirstValue(row, [
    /**
     * TZES
     */
    "TZES_M_FM",

    /**
     * TZEY
     */
    "TZEY_M_FM",
    "TZY_M_FM"
  ]);

  const reportId = getFirstValue(row, [
    "TZ_LKR_TAN",
    "LKR_TAN"
  ]);

  const patID = getFirstValue(row, [
    "TZ_P_PID",
    "PATID",
    "patid"
  ]);

  const centerCaseRaw = getFirstValue(centerCaseRow ?? {}, [
    /**
     * TZVS
     */
    "TZV_ZFALL",
    "TZVS_ZFALL",

    /**
     * TZVY
     */
    "TZVY_ZFALL",

    /**
     * Fallback
     */
    "ZFALL"
  ]);

  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    primaryCase: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZE_PFALL",
        "ZN2_TZES_PFALL",
        "ZN2_TZES_D_PFALL",
        "ZN2_TZEY_PFALL",
        "ZN2_TZEY_D_PFALL"
      ],
      primaryCaseRaw
    ),

    diagnosisDate,

    ICDO_histologyCode: histologyCode ?? null,
    ICDO_histologyCodeText: histologyText ?? null,

    ICDO_histologyDate: diagnosisDate,

    ICDO_localizationCode: icdoLocalizationCode ?? null,
    ICDO_localizationCodeText: icdoLocalizationText ?? null,

    ICD_ICD10: icd10Code ?? null,
    ICD_ICD10Text: icd10Text ?? null,

    diagnosisAssurance: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZE_D_DIAS",
        "ZN2_TZES_D_DIAS",
        "ZN2_TZEY_D_DIAS"
      ],
      diagnosisAssuranceRaw
    ),

    diagnosisReason: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZE_D_DIAA",
        "ZN2_TZES_D_DIAA",
        "ZN2_TZEY_D_DIAA"
      ],
      diagnosisReasonRaw
    ),

    side: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZES_D_SEI",
        "ZN2_TZE_D_SEI",
        "ZN2_TZEY_D_SEI"
      ],
      sideRaw
    ),

    hasMetastasis: mapHasMetastasis(metastasisRaw),

    reportDate,
    reportID: reportId ?? null,

    patID: patID ? String(patID).trim() : null,

    centerCase: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZV_ZFALL",
        "ZN2_TZVS_ZFALL",
        "ZN2_TZVS_D_ZFALL",
        "ZN2_TZVY_ZFALL",
        "ZN2_TZVY_D_ZFALL"
      ],
      centerCaseRaw
    ),

    organizationalUnit: tztiRow?.orgfa
      ? String(tztiRow.orgfa).trim()
      : null,

    internal: mapInternal(tztiRow?.orgfa)
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

function mapHasMetastasis(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["0", "n", "nein", "false", "m0"].includes(normalized)) {
    return 0;
  }

  if (["1", "j", "ja", "true", "m1"].includes(normalized)) {
    return 1;
  }

  /**
   * Falls TZES_M_FM/TZEY_M_FM ein konkreter Code ist,
   * interpretieren wir vorhandene Werte erstmal als "hat Metastase".
   */
  return 1;
}

function mapInternal(orgfa) {
  if (orgfa === null || orgfa === undefined || orgfa === "") {
    return "Meine Einrichtung";
  }

  const normalized = String(orgfa).trim().toUpperCase();

  if (normalized === "ICEX") {
    return "Andere Einrichtung";
  }

  return "Meine Einrichtung";
}