// mappers/patientMapper.mjs
import { toCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock patient-Ressource aus:
 * - npat.txt
 * - tzpi.txt
 */
export function mapPatient(npatRow, tzpiRow, patID) {
  return {
    area: npatRow.ort ?? null,
    patID: patID ? String(patID).trim() : null,
    postalCode: npatRow.pstlz ?? null,
    countryCode: npatRow.land ?? null,
    vitalDate: toCredosIsoDateOrNull(tzpiRow?.TZPI_B_ABD),
    vitalState: mapVitalState(tzpiRow?.TZPI_B_ABG),
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

function mapVitalState(value) {
  if (!value) {
    return null;
  }

  /**
   * Aktuell 1:1.
   * Wenn TZPI_B_ABG später bestimmte CREDOS-Codes enthält,
   * kannst du hier ein fachliches Mapping ergänzen.
   */
  return String(value).trim();
}