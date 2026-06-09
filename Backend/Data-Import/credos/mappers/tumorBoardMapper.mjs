// mappers/tumorBoardMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut omock tumorBoard-Ressourcen aus:
 * - tzes_tb.txt
 * - tzvs_tb.txt
 * - tzey.txt
 *
 * Zielstruktur:
 * {
 *   tumorID,
 *   type,
 *   recommendation,
 *   tumorBoardOccurrenceDate
 * }
 */
export function mapTumorBoardsForRow(row, context = {}) {
  const {
    sourceType,
    getNumericTumorId
  } = context;

  if (sourceType === "tzes_tb") {
    return mapTzesTb(row, { getNumericTumorId });
  }

  if (sourceType === "tzvs_tb") {
    return mapTzvsTb(row, { getNumericTumorId });
  }

  if (sourceType === "tzey") {
    return mapTzey(row, { getNumericTumorId });
  }

  return [];
}

function mapTzesTb(row, context) {
  const entries = [];

  const preTherapeuticEntry = buildTumorBoardEntry(row, {
    ...context,
    source: "tzes_tb",
    type: "pre-therapeutic",
    dateFields: [
      "TZES_TBTD"
    ],
    recommendationFields: [
      { field: "TZES_TBTO", code: "OP" },
      { field: "TZES_TBTC", code: "CH" },
      { field: "TZES_TBTR", code: "ST" },
      { field: "TZES_TBTH", code: "HO" },
      { field: "TZES_TBTI", code: "IM" },
      { field: "TZES_TBAT", code: "OT" }
    ]
  });

  if (preTherapeuticEntry) {
    entries.push(preTherapeuticEntry);
  }

  const postTherapeuticEntry = buildTumorBoardEntry(row, {
    ...context,
    source: "tzes_tb",
    type: "post-therapeutic",
    dateFields: [
      "TZES_TBTPD"
    ],
    recommendationFields: [
      { field: "TZES_TBTPO", code: "OP" },
      { field: "TZES_TBTPC", code: "CH" },
      { field: "TZES_TBTPR", code: "ST" },
      { field: "TZES_TBTPH", code: "HO" },
      { field: "TZES_TBTPI", code: "IM" },
      { field: "TZES_TBTPAT", code: "OT" }
    ]
  });

  if (postTherapeuticEntry) {
    entries.push(postTherapeuticEntry);
  }

  return entries;
}

function mapTzvsTb(row, context) {
  const rawType = emptyToNull(row.TZVS_TBTTA);

  const entry = buildTumorBoardEntry(row, {
    ...context,
    source: "tzvs_tb",
    type: mapTumorBoardType(rawType),
    dateFields: [
      "TZVS_TBTTD"
    ],
    recommendationFields: [
      { field: "TZVS_TBTTO", code: "OP" },
      { field: "TZVS_TBTTC", code: "CH" },
      { field: "TZVS_TBTTR", code: "ST" },
      { field: "TZVS_TBTTH", code: "HO" },
      { field: "TZVS_TBTTI", code: "IM" },
      { field: "TZVS_TBTAT", code: "OT" }
    ]
  });

  return entry ? [entry] : [];
}

function mapTzey(row, context) {
  const entries = [];

  const preTherapeuticEntry = buildTumorBoardEntry(row, {
    ...context,
    source: "tzey",
    type: "pre-therapeutic",
    dateFields: [
      "TZETK_PRDA",
      "TZE_TK_PRDA",
      "TZ_TK_PRDA"
    ],
    recommendationFields: [
      { field: "TZETK_PREL", code: "LL" }
    ]
  });

  if (preTherapeuticEntry) {
    entries.push(preTherapeuticEntry);
  }

  const postTherapeuticEntry = buildTumorBoardEntry(row, {
    ...context,
    source: "tzey",
    type: "post-therapeutic",
    dateFields: [
      "TZETK_PODA",
      "TZE_TK_PODA",
      "TZ_TK_PODA"
    ],
    recommendationFields: [
      { field: "TZETK_POEL", code: "LL" }
    ]
  });

  if (postTherapeuticEntry) {
    entries.push(postTherapeuticEntry);
  }

  return entries;
}

function buildTumorBoardEntry(row, config) {
  const {
    source,
    type,
    dateFields = [],
    recommendationFields,
    getNumericTumorId
  } = config;

  const tumorIdRaw = getFirstValue(row, [
    "TZ_T_TID",
    "tumorid",
    "TUMORID"
  ]);

  const rawDate = getFirstValue(row, dateFields);

  const tumorBoardOccurrenceDate = toOptionalCredosIsoDateOrNull(
    rawDate,
    `${source}.${dateFields.join("|")}`
  );

  const recommendation = buildRecommendation(row, recommendationFields);


  /**
   * Keine komplett leeren Tumorboard-Einträge schreiben.
   * tumorID alleine reicht nicht.
   */
  if (!tumorBoardOccurrenceDate && !recommendation && !type) {
    return null;
  }

  return {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    type,

    recommendation,

    tumorBoardOccurrenceDate
  };
}

function mapTumorBoardType(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();

  if ([
    "P",
    "PR",
    "PRE",
    "PRAE",
    "PRÄ",
    "PRAETHERAPEUTISCH",
    "PRÄTHERAPEUTISCH"
  ].includes(upper)) {
    return "pre-therapeutic";
  }

  if ([
    "O",
    "PO",
    "POST",
    "POSTOP",
    "POSTOPERATIV",
    "POSTTHERAPEUTISCH"
  ].includes(upper)) {
    return "post-therapeutic";
  }

  return normalized;
}

function buildRecommendation(row, recommendationFields = []) {
  const recommendationCodes = recommendationFields
    .filter(({ field }) => isRecommendationPresent(row[field]))
    .map(({ code }) => code);

  if (recommendationCodes.length === 0) {
    return null;
  }

  return recommendationCodes.join(",");
}

function isRecommendationPresent(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return false;
  }

  const upper = normalized.toUpperCase();

  /**
   * Explizite Negativwerte nicht als Empfehlung werten.
   */
  if (["0", "N", "NEIN", "FALSE", "F"].includes(upper)) {
    return false;
  }

  return true;
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
