// mappers/therapyMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock therapy-Ressource aus:
 * - tzth.txt als Hauptquelle
 * - tzth_kp.txt für Komplikationen
 *
 * Übersetzungen:
 * - TZTH_A_ZIE  => intention / surgeryContext via dd07v
 * - TZTH_DZ_OP  => emergencySurgery via dd07v
 * - TZTH_A_A    => terminationReason via dd07v
 * - TZTH_KP_KK  => complication description via complicationLookup / dd07v fallback
 * - TZTH_KP_KG  => complication grade via complicationLookup / dd07v fallback
 */
export function mapTherapy(tzthRow, context = {}) {
  const {
    therapyID,
    complicationRows = [],
    getNumericTumorId,
    dd07vLookup,
    complicationLookup
  } = context;

  const therapyGoalRaw = emptyToNull(tzthRow.TZTH_A_ZIE);
  const therapyGoalResolved = resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTH_LB_ZIE",
      "ZN2_TZTH_A_ZIE",
      "TZTH_A_ZIE"
    ],
    therapyGoalRaw
  );

  const therapyGoalMapping = mapTherapyGoal(
    therapyGoalRaw,
    therapyGoalResolved
  );

  const ops = buildOpsValue(tzthRow, {
    therapyID
  });

  const complication = buildComplicationValue(complicationRows, {
    therapyID,
    documentNumber: tzthRow.DOKNR,
    dd07vLookup,
    complicationLookup
  });

  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tzthRow.TZ_T_TID)
      : numericOrNull(tzthRow.TZ_T_TID),

    therapyID,

    intention: therapyGoalMapping.intention,

    organizationalUnit: tzthRow.TZTH_E_KLI
      ? String(tzthRow.TZTH_E_KLI).trim()
      : null,

    therapyEndDate: toOptionalCredosIsoDateOrNull(
      tzthRow.TZTH_A_EDD,
      "TZTH_A_EDD"
    ),

    protocol: emptyToNull(tzthRow.TZTH_A_CHS),

    surgeryContext: therapyGoalMapping.surgeryContext,

    generalType: mapGeneralType(tzthRow.TZTH_A_ART),

    subType: emptyToNull(tzthRow.TZTH_A_MAT),

    localRState: emptyToNull(tzthRow.TZTH_A_R),

    emergencySurgery: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZTH_DZ_OP",
        "TZTH_DZ_OP"
      ],
      tzthRow.TZTH_DZ_OP
    ),

    internal: mapInternal(tzthRow.TZTH_E_KLI),

    terminationReason: resolveDd07vValue(
      dd07vLookup,
      [
        "ZN2_TZTH_A_A",
        "ZN2_TZTH_A_ABBRUCH",
        "ZN2_TZTH_ABBRUCH",
        "TZTH_A_A"
      ],
      tzthRow.TZTH_A_A
    ),

    status: null,
    combination: null,
    resectionType: null,

    cyclesPlanned: toNumberOrNull(tzthRow.TZTH_A_ACZ),
    cyclesPerformed: null,

    doseDeviation: emptyToNull(tzthRow.TZTH_A_SYD),

    ECOG: null,
    ASA: null,

    complication,

    substance: emptyToNull(tzthRow.TZTH_A_CHW),

    reportID: emptyToNull(tzthRow.TZ_LKR_TAN),

    ops,

    metastasisResection: null,
    surgeon: null,

    therapyOccurrenceDate: toOptionalCredosIsoDateOrNull(
      tzthRow.TZTH_A_BDD,
      "TZTH_A_BDD"
    )
  };
}

function buildComplicationValue(complicationRows, context = {}) {
  const {
    therapyID,
    documentNumber,
    dd07vLookup,
    complicationLookup
  } = context;

  const entries = complicationRows
    .map(row => formatComplicationEntry(row, {
      dd07vLookup,
      complicationLookup
    }))
    .filter(Boolean);

  const result = entries.length > 0
    ? entries.join("$")
    : null;


  return result;
}

function formatComplicationEntry(row, context = {}) {
  const {
    dd07vLookup,
    complicationLookup
  } = context;

  const complicationCode = emptyToNull(row.TZTH_KP_KK);
  const gradeCode = emptyToNull(row.TZTH_KP_KG);

  /**
   * Ohne Komplikationscode/-beschreibung schreiben wir keinen Eintrag.
   */
  if (!complicationCode) {
    return null;
  }

  const description = resolveComplicationDescription(
    complicationLookup,
    dd07vLookup,
    complicationCode
  );

  const grade = resolveComplicationGrade(
    complicationLookup,
    dd07vLookup,
    complicationCode,
    gradeCode
  );

  const standard = resolveComplicationStandard(
    complicationLookup,
    complicationCode,
    gradeCode,
    row.TZTH_KP_MA
  );

  const fields = [
    description,
    grade,
    complicationCode,
    standard
  ]
    .map(value => emptyToNull(value))
    .filter(value => value !== null);

  return fields.length > 0
    ? fields.join("§")
    : null;
}

function resolveComplicationDescription(complicationLookup, dd07vLookup, complicationCode) {
  if (!complicationCode) {
    return null;
  }

  const fromComplicationLookup = complicationLookup?.resolveClass?.(complicationCode, { fallbackToCode: false });

  if (fromComplicationLookup) {
    return fromComplicationLookup;
  }

  return resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTH_KP_KK",
      "ZN2_TZTH_D_KK",
      "ZN2_TZTH_KK",
      "TZTH_KP_KK"
    ],
    complicationCode
  );
}

function resolveComplicationGrade(complicationLookup, dd07vLookup, complicationCode, gradeCode) {
  if (!gradeCode) {
    return null;
  }

  const fromComplicationLookup = complicationLookup?.resolveStage?.(
    complicationCode,
    gradeCode,
    { fallbackToCode: false }
  );

  if (fromComplicationLookup) {
    return fromComplicationLookup;
  }

  return resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTO_KPTKG",
      "ZN2_TZTH_KP_KG",
      "ZN2_TZTH_D_KG",
      "ZN2_TZTH_KG",
      "TZTH_KP_KG"
    ],
    gradeCode
  );
}

function resolveComplicationStandard(complicationLookup, complicationCode, gradeCode, standardRaw) {
  const explicitStandard = emptyToNull(standardRaw);

  if (explicitStandard) {
    return explicitStandard;
  }

  const fromComplicationLookup = complicationLookup?.resolveStandard?.(complicationCode, gradeCode);

  if (fromComplicationLookup) {
    return fromComplicationLookup;
  }

  const normalizedGrade = emptyToNull(gradeCode)?.toUpperCase();

  if (!normalizedGrade) {
    return "CTCAE";
  }

  if (normalizedGrade.startsWith("CLD_")) {
    return "Clavien-Dindo";
  }

  if (normalizedGrade.startsWith("CTC_")) {
    return "CTCAE";
  }

  return "CTCAE";
}

function resolveDd07vValue(dd07vLookup, domainNames, code) {
  if (code === null || code === undefined || code === "") {
    return null;
  }

  const normalizedCode = String(code).trim();

  if (normalizedCode === "") {
    return null;
  }

  if (!dd07vLookup) {
    return normalizedCode;
  }

  return dd07vLookup.resolve(domainNames, normalizedCode, {
    fallbackToCode: true
  });
}

function buildOpsValue(row, context = {}) {
  const { therapyID } = context;

  const rawOpsEntries = [
    {
      index: 1,
      codeField: "TZTH_A_OPS",
      textField: "TZTH_A_OPT",
      code: row.TZTH_A_OPS,
      text: row.TZTH_A_OPT
    },
    {
      index: 2,
      codeField: "TZTH_A_OP2",
      textField: "TZTH_A_OT2",
      code: row.TZTH_A_OP2,
      text: row.TZTH_A_OT2
    },
    {
      index: 3,
      codeField: "TZTH_A_OP3",
      textField: "TZTH_A_OT3",
      code: row.TZTH_A_OP3,
      text: row.TZTH_A_OT3
    },
    {
      index: 4,
      codeField: "TZTH_A_OP4",
      textField: "TZTH_A_OT4",
      code: row.TZTH_A_OP4,
      text: row.TZTH_A_OT4
    },
    {
      index: 5,
      codeField: "TZTH_A_OP5",
      textField: "TZTH_A_OT5",
      code: row.TZTH_A_OP5,
      text: row.TZTH_A_OT5
    },
    {
      index: 6,
      codeField: "TZTH_A_OP6",
      textField: "TZTH_A_OT6",
      code: row.TZTH_A_OP6,
      text: row.TZTH_A_OT6
    }
  ];

  const normalizedOpsEntries = rawOpsEntries.map(entry => ({
    ...entry,
    code: emptyToNull(entry.code),
    text: emptyToNull(entry.text)
  }));

  const validOpsEntries = normalizedOpsEntries
    .filter(entry => Boolean(entry.code))
    .map(entry => formatOpsEntry(entry.code, entry.text));

  const skippedTextOnlyEntries = normalizedOpsEntries.filter(entry => {
    const hasCode = Boolean(entry.code);
    const hasText = Boolean(entry.text);

    return !hasCode && hasText;
  });

  const opsValue = validOpsEntries.length > 0
    ? validOpsEntries.join("$")
    : null;


  return opsValue;
}

function formatOpsEntry(code, text) {
  const normalizedCode = emptyToNull(code);
  const normalizedText = emptyToNull(text);

  if (!normalizedCode) {
    return null;
  }

  return `${normalizedCode}§${normalizedText ?? ""}`;
}

function hasAnyOpsValue(entries) {
  return entries.some(entry => entry.code || entry.text);
}

function mapTherapyGoal(rawValue, resolvedValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return {
      intention: null,
      surgeryContext: null
    };
  }

  const originalValue = String(rawValue).trim();
  const normalized = originalValue.toUpperCase();
  const outputValue = emptyToNull(resolvedValue) ?? originalValue;

  if (["N", "A"].includes(normalized)) {
    return {
      intention: null,
      surgeryContext: outputValue
    };
  }

  return {
    intention: outputValue,
    surgeryContext: null
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
