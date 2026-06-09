// mappers/singleRadiationMapper.mjs

/**
 * Baut eine omock singleRadiation-Ressource aus TZTH_STR.
 *
 * Join:
 * - tzth_str.DOKNR -> tzth.DOKNR
 * - therapyID kommt aus der im Importer vergebenen Therapie-ID zur TZTH-DOKNR.
 *
 * Wichtig zur neueren TZTH_STR-Struktur:
 * Die neueren Felder werden bevorzugt genutzt, falls sie vorhanden sind:
 * - TZTHSTZGB3  = Zielgebiet / Bereich, neuer Zielgebiet-Code
 * - TZTHSTART3  = Strahlenart / Strahlenart-Nuklid-Code
 * - TZTHSTBOO3  = Boost-Art
 * - TZTHSTAPA3  = Bestrahlungsart / Verfahren, neuer zusammenfassender Code
 *
 * Zielstruktur:
 * {
 *   therapyID,
 *   type,
 *   brachyType,
 *   area,
 *   boost,
 *   side,
 *   tech,
 *   radioType,
 *   radioNuclid,
 *   singleDose,
 *   singleDoseUnit,
 *   lymphNodes,
 *   totalDose,
 *   radioTarget,
 *   performance,
 *   breath,
 *   stereo,
 *   duration,
 *   combination
 * }
 */
export function mapSingleRadiation(tzthStrRow, context = {}) {
  const {
    parentTherapyRow,
    therapyID,
    dd07vLookup
  } = context;

  const oldProcedureRaw = getFirstValue(tzthStrRow, [
    "TZTHST_APA"
  ]);

  const oldDetailRaw = getFirstValue(tzthStrRow, [
    "TZTHST_DOA"
  ]);

  const newProcedureRaw = getFirstValue(tzthStrRow, [
    "TZTHSTAPA3"
  ]);

  const newRadiationKindRaw = getFirstValue(tzthStrRow, [
    "TZTHSTART3"
  ]);

  const newBoostRaw = getFirstValue(tzthStrRow, [
    "TZTHSTBOO3"
  ]);

  const sideRaw = getFirstValue(tzthStrRow, [
    "TZTHST_SEI"
  ]);

  const lymphNodesRaw = getFirstValue(tzthStrRow, [
    "TZTHST_ZIN"
  ]);

  const parentSubTypeRaw = getFirstValue(parentTherapyRow ?? {}, [
    "TZTH_A_MAT"
  ]);

  const parentGeneralTypeRaw = getFirstValue(parentTherapyRow ?? {}, [
    "TZTH_A_ART"
  ]);

  const combinationRaw = getFirstValue(parentTherapyRow ?? {}, [
    "TZTH_A_MUL"
  ]);

  const procedureCode = emptyToNull(newProcedureRaw) ?? emptyToNull(oldProcedureRaw);
  const detailCode = emptyToNull(newBoostRaw) ?? emptyToNull(oldDetailRaw);

  const singleRadiation = {
    therapyID,

    type: resolveRadiationType({
      procedureCode,
      oldProcedureCode: oldProcedureRaw,
      parentSubTypeRaw,
      parentGeneralTypeRaw,
      dd07vLookup
    }),

    brachyType: resolveBrachyType({
      procedureCode,
      oldProcedureCode: oldProcedureRaw
    }),

    area: emptyToNull(getFirstValue(tzthStrRow, [
      "TZTHSTZGB3",
      "TZTHST_ZGB"
    ])),

    boost: resolveBoost({
      newBoostCode: newBoostRaw,
      oldDetailCode: oldDetailRaw
    }),

    side: resolveSide(dd07vLookup, sideRaw),

    /**
     * Für VMAT/IMRT sehe ich in TZTH_STR/TZTH aktuell kein eigenes belastbares Feld.
     * TZTHSTAPA3 kodiert eher Verfahren/Art, nicht konkrete Bestrahlungstechnik.
     */
    tech: null,

    radioType: resolveRadioType({
      radiationKindCode: newRadiationKindRaw,
      dd07vLookup
    }),

    radioNuclid: resolveRadioNuclid({
      radiationKindCode: newRadiationKindRaw,
      dd07vLookup
    }),

    singleDose: normalizeDecimalString(getFirstValue(tzthStrRow, [
      "TZTHST_EDO"
    ])),

    singleDoseUnit: emptyToNull(getFirstValue(tzthStrRow, [
      "TZTHST_EHD"
    ])),

    lymphNodes: resolveLymphNodes(lymphNodesRaw),

    totalDose: normalizeDecimalString(getFirstValue(tzthStrRow, [
      "TZTHST_GDO"
    ])),

    radioTarget: resolveRadioTarget({
      lymphNodesRaw,
      parentSubTypeRaw,
      parentGeneralTypeRaw
    }),

    performance: resolvePerformance({
      procedureCode,
      oldDetailCode: oldDetailRaw
    }),

    breath: resolveBreath(procedureCode),

    stereo: resolveStereo(procedureCode),

    /**
     * In den Daten gibt es kein sicheres Feld für konkrete Dauer wie "6h".
     * Die neue Ausprägung im Screenshot "Temporär/Permanent" ist eher ein
     * Kategorisierungsfeld, das ich in TZTH_STR nicht eindeutig finde.
     */
    duration: null,

    combination: resolveCombination({
      procedureCode,
      combinationRaw,
      dd07vLookup
    })
  };

  /**
   * Keine komplett leeren Detailbestrahlungen schreiben.
   * therapyID alleine reicht nicht.
   */
  if (
    !singleRadiation.type &&
    !singleRadiation.brachyType &&
    !singleRadiation.area &&
    !singleRadiation.boost &&
    !singleRadiation.side &&
    !singleRadiation.tech &&
    !singleRadiation.radioType &&
    !singleRadiation.radioNuclid &&
    !singleRadiation.singleDose &&
    !singleRadiation.singleDoseUnit &&
    !singleRadiation.lymphNodes &&
    !singleRadiation.totalDose &&
    !singleRadiation.radioTarget &&
    !singleRadiation.performance &&
    !singleRadiation.breath &&
    !singleRadiation.stereo &&
    !singleRadiation.duration &&
    !singleRadiation.combination
  ) {
    return null;
  }

  return singleRadiation;
}

function resolveRadiationType({
  procedureCode,
  oldProcedureCode,
  parentSubTypeRaw,
  parentGeneralTypeRaw,
  dd07vLookup
}) {
  const normalizedProcedure = emptyToNull(procedureCode);
  const upperProcedure = normalizedProcedure?.toUpperCase() ?? null;

  /**
   * Neue TZTHSTAPA3-Codes:
   * P*, PRC*  => perkutan / Teletherapie
   * K*, I*    => Kontakt-/Brachytherapie
   * M*        => metabolisch / radionuklidär, in unserer Zielkategorie erstmal Sonstige Verfahren
   * S         => Sonstige
   */
  if (upperProcedure) {
    if (
      upperProcedure === "P" ||
      upperProcedure.startsWith("P-") ||
      upperProcedure.startsWith("PRC")
    ) {
      return "Teletherapie";
    }

    if (upperProcedure.startsWith("K") || upperProcedure.startsWith("I")) {
      return "Brachytherapie";
    }

    if (upperProcedure.startsWith("M")) {
      return "Sonstige Verfahren";
    }

    if (upperProcedure === "S") {
      return "Sonstige";
    }
  }

  const oldProcedure = emptyToNull(oldProcedureCode)?.toUpperCase() ?? null;

  /**
   * Alte TZTHST_APA-Codes:
   * P = perkutan, K/I = Kontakttherapie, M = metabolisch, S = Sonstige.
   */
  if (oldProcedure === "P") {
    return "Teletherapie";
  }

  if (["K", "I"].includes(oldProcedure)) {
    return "Brachytherapie";
  }

  if (oldProcedure === "M") {
    return "Sonstige Verfahren";
  }

  if (oldProcedure === "S") {
    return "Sonstige";
  }

  const parentSubType = resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTH_A_MAT",
      "TZTH_A_MAT"
    ],
    parentSubTypeRaw
  );

  const parentGeneralType = resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTH_A_ART",
      "TZTH_A_ART"
    ],
    parentGeneralTypeRaw
  );

  const parentText = [parentSubType, parentGeneralType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (parentText.includes("strahl") || parentText.includes("bestrahl")) {
    return "Teletherapie";
  }

  if (parentText.includes("nuk") || parentText.includes("sirt") || parentText.includes("radiojod")) {
    return "Sonstige Verfahren";
  }

  return null;
}

function resolveBrachyType({ procedureCode, oldProcedureCode }) {
  const normalizedProcedure = emptyToNull(procedureCode)?.toUpperCase() ?? null;

  if (normalizedProcedure?.startsWith("I")) {
    return "interstitiell";
  }

  if (normalizedProcedure?.startsWith("K")) {
    return "intrakavitär";
  }

  const oldProcedure = emptyToNull(oldProcedureCode)?.toUpperCase() ?? null;

  if (oldProcedure === "I") {
    return "interstitiell";
  }

  if (oldProcedure === "K") {
    return "intrakavitär";
  }

  return null;
}

function resolveBoost({ newBoostCode, oldDetailCode }) {
  const newBoost = emptyToNull(newBoostCode)?.toUpperCase() ?? null;

  if (newBoost) {
    const boostMap = new Map([
      ["J", "Bestrahlung mit Boost"],
      ["N", "Bestrahlung ohne Boost"],
      ["SIB", "Simultan integrierter Boost"],
      ["SEQ", "Sequentieller Boost"],
      ["KON", "Konkomitanter Boost"]
    ]);

    if (boostMap.has(newBoost)) {
      return boostMap.get(newBoost);
    }

    return newBoost;
  }

  const oldDetail = emptyToNull(oldDetailCode)?.toUpperCase() ?? null;

  if (!oldDetail) {
    return "Bestrahlung ohne Boost";
  }

  if (["BOOST", "MIT BOOST", "BOOST_MIT"].includes(oldDetail)) {
    return "Bestrahlung mit Boost";
  }

  if (["IOPBT"].includes(oldDetail)) {
    return "Intraoperativer Boost";
  }

  if (["ONLYBOOST", "BOOSTONLY", "NUR BOOST", "AUSSCHLIESSLICH BOOST", "AUSSCHLIEßLICH BOOST"].includes(oldDetail)) {
    return "Ausschließlich Boost Bestrahlung";
  }

  /**
   * HDR/LDR/PDR/SIRT/PRRT sind keine Boost-Ausprägungen, sondern gehen in performance/type.
   */
  if (["HDR", "LDR", "PDR", "SIRT", "PRRT", "RJT", "RIT"].includes(oldDetail)) {
    return "Bestrahlung ohne Boost";
  }

  return oldDetail;
}

function resolveSide(dd07vLookup, value) {
  const resolved = resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTHST_SEI",
      "ZN2_TZ_SEITE",
      "ZN2_TZES_D_SEI",
      "TZTHST_SEI"
    ],
    value
  );

  const normalized = emptyToNull(resolved);

  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();

  const fallbackMap = new Map([
    ["L", "links"],
    ["R", "rechts"],
    ["B", "beidseits"],
    ["M", "mittig"],
    ["T", "trifft nicht zu"],
    ["X", "unbekannt"]
  ]);

  return fallbackMap.get(upper) ?? normalized;
}

function resolveRadioType({ radiationKindCode, dd07vLookup }) {
  const code = emptyToNull(radiationKindCode);

  if (!code) {
    return null;
  }

  const upper = code.toUpperCase();

  const radioTypeMap = new Map([
    ["UH", "Photonen"],
    ["Co-60", "Photonen"],
    ["CO-60", "Photonen"],
    ["EL", "Elektronen"],
    ["PN", "Protonen"],
    ["SI", "Schwerionen"],
    ["NE", "Neutronen"],
    ["RO", "Weichstrahl"],
    ["SO", "Sonstige"]
  ]);

  if (radioTypeMap.has(upper)) {
    return radioTypeMap.get(upper);
  }

  /**
   * Nuklide werden in radioNuclid geschrieben, nicht in radioType.
   */
  if (isRadioNuclidCode(upper)) {
    return null;
  }

  const resolved = resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTHSTART3",
      "TZTHSTART3"
    ],
    code
  );

  return resolved;
}

function resolveRadioNuclid({ radiationKindCode, dd07vLookup }) {
  const code = emptyToNull(radiationKindCode);

  if (!code) {
    return null;
  }

  const upper = code.toUpperCase();

  const nuclidMap = new Map([
    ["CO-60", "Cobalt (Co-60)"],
    ["Co-60", "Cobalt (Co-60)"],
    ["LU-177", "Lutetium (Lu-177)"],
    ["J-131", "Iod (J-131)"],
    ["I-131", "Iod (I-131)"],
    ["Y-90", "Yttrium (Y-90)"],
    ["IR-192", "Iridium (Ir-192)"],
    ["RA-223", "Radium (Ra-223)"],
    ["AC-225", "Actinium (Ac-225)"],
    ["SM-153", "Samarium (Sm-153)"],
    ["TB-161", "Terbium (Tb-161)"],
    ["SR-89", "Strontium (Sr-89)"],
    ["SONU", "Sonstige Nuklide"]
  ]);

  if (nuclidMap.has(upper)) {
    return nuclidMap.get(upper);
  }

  if (!isRadioNuclidCode(upper)) {
    return null;
  }

  return resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTHSTART3",
      "TZTHSTART3"
    ],
    code
  );
}

function isRadioNuclidCode(upperCode) {
  return [
    "CO-60",
    "LU-177",
    "J-131",
    "I-131",
    "Y-90",
    "IR-192",
    "RA-223",
    "AC-225",
    "SM-153",
    "TB-161",
    "SR-89",
    "SONU"
  ].includes(upperCode);
}

function resolveLymphNodes(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();

  if (["+LK", "LK+", "J", "JA", "Y", "YES", "1", "TRUE"].includes(upper)) {
    return "Ja";
  }

  if (["-LK", "LK-", "N", "NEIN", "NO", "0", "FALSE"].includes(upper)) {
    return "Nein";
  }

  return normalized;
}

function resolveRadioTarget({ lymphNodesRaw, parentSubTypeRaw, parentGeneralTypeRaw }) {
  const lymphNodes = resolveLymphNodes(lymphNodesRaw);

  if (lymphNodes === "Ja") {
    return "Regionäre Lymphknoten";
  }

  const parentText = [parentSubTypeRaw, parentGeneralTypeRaw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    parentText.includes("metast") ||
    parentText.includes("organbefall") ||
    parentText.includes("sirt") ||
    parentText.includes("prrt")
  ) {
    return "Fernmetastasen";
  }

  if (parentText.includes("strahl") || parentText.includes("bestrahl")) {
    return "Primärlokalisation";
  }

  return null;
}

function resolvePerformance({ procedureCode, oldDetailCode }) {
  const procedure = emptyToNull(procedureCode)?.toUpperCase() ?? "";
  const oldDetail = emptyToNull(oldDetailCode)?.toUpperCase() ?? "";
  const combined = `${procedure} ${oldDetail}`;

  if (combined.includes("HDR")) {
    return "High-Dose-Rate";
  }

  if (combined.includes("LDR")) {
    return "Low-Dose-Rate";
  }

  if (combined.includes("PDR")) {
    return "Pulsed-Dose-Rate";
  }

  return null;
}

function resolveBreath(procedureCode) {
  const upper = emptyToNull(procedureCode)?.toUpperCase() ?? "";

  if (upper.includes("4D")) {
    return "Yes";
  }

  return null;
}

function resolveStereo(procedureCode) {
  const upper = emptyToNull(procedureCode)?.toUpperCase() ?? "";

  if (upper.includes("ST")) {
    return "Yes";
  }

  return null;
}

function resolveCombination({ procedureCode, combinationRaw, dd07vLookup }) {
  const upperProcedure = emptyToNull(procedureCode)?.toUpperCase() ?? "";

  if (upperProcedure.startsWith("PRCJ")) {
    return "Radiochemotherapie";
  }

  if (upperProcedure.startsWith("PRCN")) {
    return "Bestrahlung ohne Chemotherapie/Sensitizer";
  }

  const combination = emptyToNull(combinationRaw)?.toUpperCase() ?? null;

  if (combination === "J") {
    return "Kombinationstherapie";
  }

  if (combination === "N") {
    return null;
  }

  if (combination === "X") {
    return "Unbekannt";
  }

  return resolveDd07vValue(
    dd07vLookup,
    [
      "ZN2_TZTH_LB_MUL",
      "TZTH_A_MUL"
    ],
    combinationRaw
  );
}

function resolveDd07vValue(dd07vLookup, domainNames, code) {
  const normalized = emptyToNull(code);

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

function normalizeDecimalString(value) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  return normalized.replace(",", ".");
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
