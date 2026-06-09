// mappers/molecularMarkerMapper.mjs
import { toOptionalCredosIsoDateOrNull } from "../utils/dates.mjs";

/**
 * Baut eine omock molecularMarker-Ressource aus:
 * - tzes_gen.txt
 * - tzey_gen.txt
 * - tzvs_gen.txt
 * - tzvy_gen.txt
 *
 * Die Detailzeilen werden über DOKNR an tzes/tzey/tzvs/tzvy gebunden.
 *
 * Übersetzungen kommen soweit möglich aus:
 * - dd07v.txt für TZ_GEN_APR
 * - zn2crgenenquiry.txt für TZ_GEN_UNT
 * - zn2crgenclasses.txt für TZ_GEN_NAM
 * - zn2crgenstages.txt für TZ_GEN_VAR
 * - zn2crgeninfo.txt für TZ_GEN_SON
 *
 * Zielstruktur:
 * {
 *   tumorID,
 *   method,
 *   type,
 *   exon,
 *   status,
 *   miscellaneous,
 *   molecularMarkerOccurrenceDate,
 *   project
 * }
 */
export function mapMolecularMarker(genRow, context = {}) {
  const {
    parentRow,
    source,
    getNumericTumorId,
    dd07vLookup,
    molecularMarkerLookup
  } = context;

  const tumorIdRaw = getFirstValue(parentRow ?? {}, [
    "TZ_T_TID",
    "tumorid",
    "TUMORID"
  ]);

  const markerNameRaw = emptyToNull(getFirstValue(genRow, [
    "TZ_GEN_NAM",
    "tz_gen_nam"
  ]));

  const methodRaw = emptyToNull(getFirstValue(genRow, [
    "TZ_GEN_UNT",
    "tz_gen_unt"
  ]));

  const statusRaw = emptyToNull(getFirstValue(genRow, [
    "TZ_GEN_APR",
    "tz_gen_apr"
  ]));

  const variantRaw = emptyToNull(getFirstValue(genRow, [
    "TZ_GEN_VAR",
    "tz_gen_var"
  ]));

  const additionalRaw = emptyToNull(getFirstValue(genRow, [
    "TZ_GEN_SON",
    "tz_gen_son"
  ]));

  const dateRaw = getFirstValue(genRow, [
    "TZ_GEN_DAT",
    "tz_gen_dat"
  ]);

  const resolvedVariant = molecularMarkerLookup?.resolveVariant?.(
    markerNameRaw,
    variantRaw,
    { fallbackToCode: true }
  ) ?? variantRaw;

  const resolvedAdditional = molecularMarkerLookup?.resolveInfo?.(
    markerNameRaw,
    additionalRaw,
    { fallbackToCode: true }
  ) ?? additionalRaw;

  const exon = extractExon(resolvedVariant ?? variantRaw);

  const molecularMarker = {
    tumorID: getNumericTumorId
      ? getNumericTumorId(tumorIdRaw)
      : numericOrNull(tumorIdRaw),

    method: molecularMarkerLookup?.resolveMethod?.(methodRaw, {
      fallbackToCode: true
    }) ?? methodRaw,

    type: molecularMarkerLookup?.resolveMarker?.(markerNameRaw, {
      fallbackToCode: true
    }) ?? markerNameRaw,

    exon,

    status: resolveStatus(statusRaw, dd07vLookup),

    miscellaneous: buildMiscellaneous({
      variantRaw,
      resolvedVariant,
      additionalRaw,
      resolvedAdditional,
      exon
    }),

    molecularMarkerOccurrenceDate: toOptionalCredosIsoDateOrNull(
      dateRaw,
      `${source ?? "molecularMarker"}.TZ_GEN_DAT`
    ),

    /**
     * In den gelieferten *_gen-Dateien ist kein belastbares Projektfeld
     * wie nNGM/DNPM vorhanden. DOKAR ist dort z.B. MTZ und beschreibt eher
     * die Dokumentart. Deshalb erstmal null statt geraten.
     */
    project: null
  };

  /**
   * Keine komplett leeren Molecular-Marker schreiben.
   * tumorID alleine reicht nicht.
   */
  if (
    !molecularMarker.method &&
    !molecularMarker.type &&
    molecularMarker.exon === null &&
    !molecularMarker.status &&
    !molecularMarker.miscellaneous &&
    !molecularMarker.molecularMarkerOccurrenceDate
  ) {
    return null;
  }

  return molecularMarker;
}

function resolveStatus(value, dd07vLookup) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  return resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZ_GEN_APR",
      "TZ_GEN_APR"
    ],
    normalized
  );
}

function extractExon(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/\bexon\s*(\d+)\b/i);

  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function buildMiscellaneous({
  variantRaw,
  resolvedVariant,
  additionalRaw,
  resolvedAdditional,
  exon
}) {
  const parts = [];

  const variantValue = emptyToNull(resolvedVariant) ?? emptyToNull(variantRaw);
  const additionalValue = emptyToNull(resolvedAdditional) ?? emptyToNull(additionalRaw);

  if (variantValue) {
    const variantForMiscellaneous = stripPlainExonPrefix(variantValue);

    /**
     * Wenn TZ_GEN_VAR nur "Exon 18" enthält, steckt die Info bereits in exon.
     * Wenn mehr enthalten ist, z.B. "Exon 20 Insertionsmut.", bleibt der
     * restliche Fachtext als miscellaneous erhalten.
     */
    if (variantForMiscellaneous) {
      parts.push(variantForMiscellaneous);
    } else if (exon === null) {
      parts.push(variantValue);
    }
  }

  if (additionalValue) {
    parts.push(additionalValue);
  }

  const uniqueParts = [...new Set(parts.map(value => emptyToNull(value)).filter(Boolean))];

  if (uniqueParts.length === 0) {
    return null;
  }

  return uniqueParts.join("§");
}

function stripPlainExonPrefix(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const withoutExon = normalized
    .replace(/^\s*exon\s*\d+\s*/i, "")
    .replace(/^[-:;,.\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  return withoutExon === "" ? null : withoutExon;
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
