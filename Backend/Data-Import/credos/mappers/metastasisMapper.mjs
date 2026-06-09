// mappers/metastasisMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock metastasis-Ressource aus:
 * - tzes_fm.txt
 * - tzvs_fm.txt
 *
 * Die Detailzeilen werden über DOKNR an tzes/tzvs gebunden.
 */
export function mapMetastasis(metastasisRow, context = {}) {
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

  const metastasisLocation = getMetastasisLocation(metastasisRow, source);
  const metastasisDateRaw = getMetastasisDate(metastasisRow, source);

  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    metastasisLocation,

    metastasisDate: toOptionalCredosIsoDateOrNull(
      metastasisDateRaw,
      `${source ?? "metastasis"}.metastasisDate`
    ),

    spread: null
  };
}

function getMetastasisLocation(row, source) {
  if (source === "tzes_fm") {
    return emptyToNull(row.TZES_M_FML);
  }

  if (source === "tzvs_fm") {
    return emptyToNull(row.TZVS_M_FML);
  }

  return getFirstValue(row, [
    "TZES_M_FML",
    "TZVS_M_FML",
    "TZEY_M_FML",
    "TZVY_M_FML"
  ]);
}

function getMetastasisDate(row, source) {
  if (source === "tzes_fm") {
    return emptyToNull(row.TZES_M_FDG);
  }

  if (source === "tzvs_fm") {
    return emptyToNull(row.TZVS_M_FDG);
  }

  return getFirstValue(row, [
    "TZES_M_FDG",
    "TZVS_M_FDG",
    "TZEY_M_FDG",
    "TZVY_M_FDG"
  ]);
}

function getFirstValue(row, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = row[fieldName];

    if (value !== null && value !== undefined && value !== "") {
      return String(value).trim();
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