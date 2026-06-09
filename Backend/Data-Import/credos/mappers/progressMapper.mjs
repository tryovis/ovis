// mappers/progressMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock progress-Ressource aus:
 * - tzvs.txt für solide Verläufe
 * - tzvy.txt für systemische Verläufe
 *
 * Aktuelles Mapping:
 * - tumorID                <= TZ_T_TID
 * - progressOccurrenceDate <= TZV_B_BEUD
 * - overallAssessment      <= TZVS_G_GES / TZVY_G_GES via dd07v
 * - tumorState             <= TZVS_P_TUM / TZVY_P_TUM via dd07v
 * - lymphNodeState         <= TZVS_R_LK / TZVY_R_LK via dd07v
 * - metastasisState        <= TZVS_M_FM / TZVY_M_FM via dd07v
 * - progressReason         <= TZV_B_GRND via dd07v
 * - progressSource         <= TZV_B_INEX via dd07v
 * - reportID               <= TZ_LKR_TAN
 *
 * Wichtig für Fernmetastasen:
 * TZVS_M_FM / TZVY_M_FM nutzen in CREDOS die Domain ZN2_TZ_RB_FM.
 * Dort werden Werte wie 0, 1, 2, 3, 4 übersetzt.
 */
export function mapProgress(row, context = {}) {
  const {
    sourceType,
    getNumericTumorId,
    dd07vLookup
  } = context;

  const tumorIdRaw = getFirstValue(row, [
    "TZ_T_TID",
    "tumorid",
    "TUMORID"
  ]);

  const progressOccurrenceDateRaw = getFirstValue(row, [
    "TZV_B_BEUD",
    "TZVY_B_BEUD",
    "BEUD"
  ]);

  const overallAssessmentRaw = getFirstValue(row, [
    "TZVS_G_GES",
    "TZVY_G_GES"
  ]);

  const tumorStateRaw = getFirstValue(row, [
    "TZVS_P_TUM",
    "TZVY_P_TUM"
  ]);

  const lymphNodeStateRaw = getFirstValue(row, [
    "TZVS_R_LK",
    "TZVY_R_LK"
  ]);

  const metastasisStateRaw = getFirstValue(row, [
    "TZVS_M_FM",
    "TZVY_M_FM"
  ]);

  const progressReasonRaw = getFirstValue(row, [
    "TZV_B_GRND",
    "TZVY_B_GRND"
  ]);

  const progressSourceRaw = getFirstValue(row, [
    "TZV_B_INEX",
    "TZVY_B_INEX"
  ]);

  const reportIdRaw = getFirstValue(row, [
    "TZ_LKR_TAN",
    "tz_lkr_tan"
  ]);

  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    progressReason: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZV_B_GRND",
        "ZN2_TZVS_B_GRND",
        "ZN2_TZVY_B_GRND"
      ],
      progressReasonRaw
    ),

    overallAssessment: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZVS_G_GES",
        "ZN2_TZVY_G_GES"
      ],
      overallAssessmentRaw
    ),

    metastasisState: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZ_RB_FM",
        "ZN2_TZVS_M_FM",
        "ZN2_TZVY_M_FM"
      ],
      metastasisStateRaw
    ),

    tumorState: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZVS_P_TUM",
        "ZN2_TZVY_P_TUM"
      ],
      tumorStateRaw
    ),

    lymphNodeState: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZVS_R_LK",
        "ZN2_TZVY_R_LK"
      ],
      lymphNodeStateRaw
    ),

    biochemRecurrence: null,

    progressSource: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZV_B_INEX",
        "ZN2_TZVS_B_INEX",
        "ZN2_TZVY_B_INEX"
      ],
      progressSourceRaw
    ),

    reportID: emptyToNull(reportIdRaw),

    progressOccurrenceDate: toOptionalCredosIsoDateOrNull(
      progressOccurrenceDateRaw,
      `${sourceType ?? "progress"}.TZV_B_BEUD`
    )
  };
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
