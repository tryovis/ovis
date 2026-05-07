// mappers/therapyMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock therapy-Ressource aus:
 * - tzth.txt als Hauptquelle
 *
 * Aktueller Stand:
 * - tumorID kommt aus TZ_T_TID
 * - therapyID wird als Auto-Increment-ID vergeben
 * - organizationalUnit kommt direkt aus TZTH_E_KLI
 * - therapyOccurrenceDate kommt aus TZTH_A_BDD
 * - therapyEndDate kommt aus TZTH_A_EDD
 * - generalType kommt aus TZTH_A_ART mit Mapping:
 *   - MET => systemic
 *   - ST  => radiation
 *   - OP  => operation
 *   - Rest bleibt Originalwert
 * - subType kommt aus TZTH_A_MAT
 * - terminationReason kommt aus TZTH_A_A
 * - substance kommt aus TZTH_A_CHW
 * - cyclesPlanned kommt aus TZTH_A_ACZ
 * - protocol kommt aus TZTH_A_CHS
 * - alle anderen Felder bleiben erstmal null
 */
export function mapTherapy(tzthRow, context = {}) {
  const {
    therapyID,
    getNumericTumorId
  } = context;

  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tzthRow.TZ_T_TID)
      : numericOrNull(tzthRow.TZ_T_TID),

    therapyID,

    intention: null,

    organizationalUnit: tzthRow.TZTH_E_KLI
      ? String(tzthRow.TZTH_E_KLI).trim()
      : null,

    therapyEndDate: toOptionalCredosIsoDateOrNull(
      tzthRow.TZTH_A_EDD,
      "TZTH_A_EDD"
    ),

    protocol: emptyToNull(tzthRow.TZTH_A_CHS),

    surgeryContext: null,

    generalType: mapGeneralType(tzthRow.TZTH_A_ART),

    subType: emptyToNull(tzthRow.TZTH_A_MAT),

    localRState: null,
    emergencySurgery: null,

    internal: mapInternal(tzthRow.TZTH_E_KLI),

    terminationReason: emptyToNull(tzthRow.TZTH_A_A),

    status: null,
    combination: null,
    resectionType: null,

    cyclesPlanned: toNumberOrNull(tzthRow.TZTH_A_ACZ),
    cyclesPerformed: null,

    doseDeviation: null,
    ECOG: null,
    ASA: null,
    complication: null,

    substance: emptyToNull(tzthRow.TZTH_A_CHW),

    ops: null,
    metastasisResection: null,
    surgeon: null,

    therapyOccurrenceDate: toOptionalCredosIsoDateOrNull(
      tzthRow.TZTH_A_BDD,
      "TZTH_A_BDD"
    )
  };
}

function mapGeneralType(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const originalValue = String(value).trim();
  const normalized = originalValue.toUpperCase();

  const mapping = {
    MET: "systemic",
    ST: "radiation",
    OP: "operation"
  };

  return mapping[normalized] ?? originalValue;
}

function emptyToNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const trimmed = String(value).trim();

  if (trimmed === "") {
    return null;
  }

  const number = Number(trimmed);

  if (Number.isNaN(number)) {
    return null;
  }

  return number;
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

function mapInternal(organizationalUnit) {
  if (
    organizationalUnit === null ||
    organizationalUnit === undefined ||
    organizationalUnit === ""
  ) {
    return "Meine Einrichtung";
  }

  const normalized = String(organizationalUnit).trim().toUpperCase();

  if (normalized === "ICEX") {
    return "Andere Einrichtung";
  }

  return "Meine Einrichtung";
}