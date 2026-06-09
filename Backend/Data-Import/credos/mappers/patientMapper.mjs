// mappers/patientMapper.mjs
import { toCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock patient-Ressource aus:
 * - npat.txt
 * - tzpi.txt
 */
export function mapPatient(npatRow, tzpiRow, patID, context = {}) {
  const { dd07vLookup } = context;

  return {
    area: npatRow.ort ?? null,
    patID: patID ? String(patID).trim() : null,
    postalCode: npatRow.pstlz ?? null,
    countryCode: npatRow.land ?? null,
    vitalDate: toCredosIsoDateOrNull(tzpiRow?.TZPI_B_ABD),
    vitalState: mapVitalState(tzpiRow?.TZPI_B_ABG, dd07vLookup),
    birthDate: toCredosIsoDateOrNull(npatRow.gbdat),
    gender: normalizeGender(npatRow.gschl),
    firstName: npatRow.vname ?? null,
    lastName: npatRow.nname ?? null
  };
}

function normalizeGender(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["m", "mann", "männlich", "maennlich", "1"].includes(normalized)) {
    return "m";
  }

  if (["w", "frau", "weiblich", "2"].includes(normalized)) {
    return "w";
  }

  if (["d", "divers", "3"].includes(normalized)) {
    return "d";
  }

  return normalized;
}

function mapVitalState(value, dd07vLookup) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const resolved = resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZPI_B_ABG",
      "TZPI_B_ABG"
    ],
    normalized
  );

  return resolved ?? normalized;
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

function emptyToNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}
