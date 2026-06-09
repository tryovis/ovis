// mappers/diagnosticMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock diagnostic-Ressource aus:
 * - tzes_diag.txt
 * - tzey_diag.txt
 * - tzvs_diag.txt
 * - tzvy_diag.txt
 *
 * Die diagnostischen Detailzeilen werden über DOKNR an tzes/tzey/tzvs/tzvy gebunden.
 *
 * Mapping:
 * - tumorID                  <= Parent-Row TZ_T_TID
 * - investigationMethod      <= TZ_DIA_UNS + " - " + TZ_DIA_ORG, jeweils über DD07V übersetzt
 * - diagnosticOccurrenceDate <= TZ_DIA_DAT
 */
export function mapDiagnostic(diagnosticRow, context = {}) {
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

  const diagnosticDateRaw = getFirstValue(diagnosticRow, [
    "TZ_DIA_DAT",
    "tz_dia_dat"
  ]);

  const methodRawUns = getFirstValue(diagnosticRow, [
    "TZ_DIA_UNS",
    "tz_dia_uns"
  ]);

  const methodRawOrg = getFirstValue(diagnosticRow, [
    "TZ_DIA_ORG",
    "tz_dia_org"
  ]);

  const diagnosticOccurrenceDate = toOptionalCredosIsoDateOrNull(
    diagnosticDateRaw,
    `${source ?? "diagnostic"}.TZ_DIA_DAT`
  );

  const investigationMethod = buildInvestigationMethod({
    examinationCode: methodRawUns,
    organRegionCode: methodRawOrg,
    dd07vLookup
  });


  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    investigationMethod,

    diagnosticOccurrenceDate
  };
}

function buildInvestigationMethod({ examinationCode, organRegionCode, dd07vLookup }) {
  const normalizedExaminationCode = emptyToNull(examinationCode);
  const normalizedOrganRegionCode = emptyToNull(organRegionCode);

  if (!normalizedExaminationCode && !normalizedOrganRegionCode) {
    return null;
  }

  const examination = resolveDiagnosticExamination(
    dd07vLookup,
    normalizedExaminationCode
  );

  const organRegion = resolveDiagnosticOrganRegion(
    dd07vLookup,
    normalizedOrganRegionCode
  );

  if (examination && organRegion) {
    return `${examination} - ${organRegion}`;
  }

  return examination ?? organRegion ?? null;
}

function resolveDiagnosticExamination(dd07vLookup, code) {
  const resolved = resolveDd07vValue(
    dd07vLookup,
    [
      /**
       * Je nach Export-/DD07V-Stand taucht TZ_DIA_UNS unter leicht
       * unterschiedlichen Domains auf. Deshalb hier mehrere Kandidaten.
       */
      "ZN2_TZ_DIA_UNTERSUCHUNG",
      "ZN2_TZ_DIA_UNS",
      "ZN2_TZ_DIA_UNT",
      "ZN2_TZ_DIA_UNTERSUCH",
      "TZ_DIA_UNS"
    ],
    code
  );

  /**
   * Wenn DD07V nichts findet, kommt wegen fallbackToCode der Rohcode zurück.
   * Für bekannte Untersuchungs-Codes nutzen wir dann einen kleinen Fallback,
   * damit z.B. ZYT nicht als Kürzel im omock landet.
   */
  return applyDiagnosticExaminationFallback(resolved, code);
}

function resolveDiagnosticOrganRegion(dd07vLookup, code) {
  return resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZ_DIA_ORGAN_REGION",
      "ZN2_TZ_DIA_ORG",
      "TZ_DIA_ORG"
    ],
    code
  );
}

function applyDiagnosticExaminationFallback(resolvedValue, originalCode) {
  const original = emptyToNull(originalCode);

  if (!original) {
    return null;
  }

  const resolved = emptyToNull(resolvedValue);

  /**
   * Nur dann ersetzen, wenn DD07V effektiv nicht übersetzt hat.
   */
  if (resolved && resolved !== original) {
    return resolved;
  }

  const fallback = {
    CT: "CT",
    MRT: "MRT",
    PET: "PET",
    PETCT: "PET-CT",
    SONO: "Sonographie",
    SZB: "Stanzbiopsie",
    PE: "Probeexzision",
    ZYT: "Zytologie",
    HNO: "HNO-Untersuchung",
    ENDO: "Endoskopie",
    RÖ: "Röntgen",
    ROE: "Röntgen"
  };

  return fallback[original.toUpperCase()] ?? resolved ?? original;
}

function resolveDd07vValue(dd07vLookup, domainNames, code) {
  if (code === null || code === undefined || code === "") {
    return null;
  }

  const normalized = String(code).trim();

  if (!normalized) {
    return null;
  }

  if (!dd07vLookup) {
    return normalized;
  }

  return dd07vLookup.resolve(domainNames, normalized, {
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
