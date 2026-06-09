// mappers/tnmMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut omock TNM-Ressourcen aus:
 * - tzes.txt: clinical_ersterhebung + abgeschlossen_ersterhebung
 * - tzth.txt: clinical_therapie
 * - tzvs.txt: clinical_verlauf
 */
export function mapTnmsForRow(row, context = {}) {
  const {
    sourceType,
    getNumericTumorId
  } = context;

  const specs = getTnmSpecsForSource(sourceType);

  return specs
    .map(spec => mapTnmBySpec(row, spec, { getNumericTumorId }))
    .filter(Boolean);
}

function getTnmSpecsForSource(sourceType) {
  if (sourceType === "tzes") {
    return [
      {
        type: "clinical_ersterhebung",
        dateFields: ["TZE_D_DIAD"],
        totalFields: ["TZES_K_KTN"],
        yFields: ["TZES_K_KY"],
        rFields: ["TZES_K_KREZ", "TZES_K_KR"],
        preTFields: ["TZES_K_KTP"],
        tFields: ["TZES_K_KT"],
        multipleTFields: ["TZES_K_KTM"],
        preNFields: ["TZES_K_KNP"],
        nFields: ["TZES_K_KN"],
        preMFields: ["TZES_K_KMP"],
        mFields: ["TZES_K_KM"],
        uiccFields: [],
        rClassFields: [],
        aFields: [],
        nuFields: ["TZES_K_KNU"],
        nbFields: ["TZES_K_KNB"],
        sFields: [],
        pnFields: [],
        vFields: [],
        lFields: []
      },
      {
        type: "abgeschlossen_ersterhebung",
        dateFields: ["TZE_D_DIAD"],
        totalFields: ["TZES_K_ATN"],
        yFields: ["TZES_K_AY"],
        rFields: ["TZES_K_AREZ", "TZES_K_AR"],
        preTFields: ["TZES_K_ATP"],
        tFields: ["TZES_K_AT"],
        multipleTFields: ["TZES_K_ATM"],
        preNFields: ["TZES_K_ANP"],
        nFields: ["TZES_K_AN"],
        preMFields: ["TZES_K_AMP"],
        mFields: ["TZES_K_AM"],
        uiccFields: [],
        rClassFields: ["TZES_K_R"],
        aFields: ["TZES_K_AA"],
        nuFields: ["TZES_K_ANU"],
        nbFields: ["TZES_K_ANB"],
        sFields: ["TZES_K_AS"],
        pnFields: ["TZES_K_PN"],
        vFields: ["TZES_K_AV"],
        lFields: ["TZES_K_AL"]
      }
    ];
  }

  if (sourceType === "tzth") {
    return [
      {
        type: "clinical_therapie",
        dateFields: ["TZTH_A_BDD"],
        totalFields: ["TZTH_K_TNM"],
        yFields: ["TZTH_K_Y"],
        rFields: ["TZTH_K_REZ"],
        preTFields: ["TZTH_K_TP"],
        tFields: ["TZTH_K_T"],
        multipleTFields: ["TZTH_K_TMU"],
        preNFields: ["TZTH_K_NP"],
        nFields: ["TZTH_K_N"],
        preMFields: ["TZTH_K_MP"],
        mFields: ["TZTH_K_M"],
        uiccFields: [],
        rClassFields: ["TZTH_K_R"],
        aFields: ["TZTH_K_A"],
        nuFields: ["TZTH_K_NU"],
        nbFields: ["TZTH_K_NB"],
        sFields: ["TZTH_K_S"],
        pnFields: ["TZTH_K_PN"],
        vFields: ["TZTH_K_V"],
        lFields: ["TZTH_K_L"]
      }
    ];
  }

  if (sourceType === "tzvs") {
    return [
      {
        type: "clinical_verlauf",
        dateFields: ["TZV_B_BEUD"],
        totalFields: ["TZVS_K_TNM"],
        yFields: ["TZVS_K_Y"],
        rFields: ["TZVS_K_REZ"],
        preTFields: ["TZVS_K_TP"],
        tFields: ["TZVS_K_T"],
        multipleTFields: ["TZVS_K_TMU"],
        preNFields: ["TZVS_K_NP"],
        nFields: ["TZVS_K_N"],
        preMFields: ["TZVS_K_MP"],
        mFields: ["TZVS_K_M"],
        uiccFields: [],
        rClassFields: ["TZVS_K_R"],
        aFields: ["TZVS_K_A"],
        nuFields: ["TZVS_K_NUL"],
        nbFields: ["TZVS_K_NBL"],
        sFields: ["TZVS_K_AS"],
        pnFields: ["TZVS_K_PN"],
        vFields: ["TZVS_K_AV"],
        lFields: ["TZVS_K_AL"]
      }
    ];
  }

  return [];
}

function mapTnmBySpec(row, spec, context = {}) {
  const { getNumericTumorId } = context;

  const tumorIdRaw = getFirstValue(row, [
    "TZ_T_TID",
    "tumorid",
    "TUMORID"
  ]);

  const tnm = {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    type: spec.type,

    total: emptyToNull(getFirstValue(row, spec.totalFields)),

    y: mapPresenceFlag(getFirstValue(row, spec.yFields)),
    r: mapPresenceFlag(getFirstValue(row, spec.rFields)),

    preT: emptyToNull(getFirstValue(row, spec.preTFields)),
    T: emptyToNull(getFirstValue(row, spec.tFields)),

    preN: emptyToNull(getFirstValue(row, spec.preNFields)),
    N: emptyToNull(getFirstValue(row, spec.nFields)),

    preM: emptyToNull(getFirstValue(row, spec.preMFields)),
    M: emptyToNull(getFirstValue(row, spec.mFields)),

    UICC: emptyToNull(getFirstValue(row, spec.uiccFields)),

    RClass: formatPrefixedClass(
      getFirstValue(row, spec.rClassFields),
      "R"
    ),

    multipleT: emptyToNull(getFirstValue(row, spec.multipleTFields)),

    a: emptyToNull(getFirstValue(row, spec.aFields)),

    Nu: emptyToNull(getFirstValue(row, spec.nuFields)),
    Nb: emptyToNull(getFirstValue(row, spec.nbFields)),

    S: formatPrefixedClass(
      getFirstValue(row, spec.sFields),
      "S"
    ),

    Pn: formatPrefixedClass(
      getFirstValue(row, spec.pnFields),
      "Pn"
    ),

    V: formatPrefixedClass(
      getFirstValue(row, spec.vFields),
      "V"
    ),

    L: formatPrefixedClass(
      getFirstValue(row, spec.lFields),
      "L"
    ),

    tnmOccurrenceDate: toOptionalCredosIsoDateOrNull(
      getFirstValue(row, spec.dateFields),
      `${spec.type}.tnmOccurrenceDate`
    )
  };

  if (!hasAnyTnmContent(tnm)) {
    return null;
  }

  return tnm;
}

function hasAnyTnmContent(tnm) {
  return Boolean(
    tnm.total ||
    tnm.preT ||
    tnm.T ||
    tnm.preN ||
    tnm.N ||
    tnm.preM ||
    tnm.M ||
    tnm.UICC ||
    tnm.RClass ||
    tnm.multipleT ||
    tnm.a ||
    tnm.Nu ||
    tnm.Nb ||
    tnm.S ||
    tnm.Pn ||
    tnm.V ||
    tnm.L
  );
}

function mapPresenceFlag(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();

  if (["0", "N", "NEIN", "FALSE"].includes(upper)) {
    return 0;
  }

  return 1;
}

function formatPrefixedClass(value, prefix) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();
  const upperPrefix = prefix.toUpperCase();

  if (upper.startsWith(upperPrefix)) {
    return normalized;
  }

  if (/^\d+$/.test(normalized)) {
    return `${prefix}${normalized}`;
  }

  return normalized;
}

function getFirstValue(row, fieldNames = []) {
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