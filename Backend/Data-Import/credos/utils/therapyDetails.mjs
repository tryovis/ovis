import { value } from './rows.mjs';
import { toOptionalCredosIsoDateOrNull as date } from './dates.mjs';
import { resolveRadioNuclid } from '../mappers/singleRadiationMapper.mjs';

const therapyTypes = new Map([
  ['MET', 'systemic'], ['ST', 'radiation'], ['OP', 'operation'],
  ['NUK', 'nuclear'], ['ATH', 'other'], ['PHT', 'other']
]);

export function mapCredosTherapyType(raw) {
  const code = raw == null ? null : String(raw).trim() || null;
  // Unknown categories are preserved, not silently classified as "other".
  return code ? therapyTypes.get(code.toUpperCase()) ?? code : null;
}

const uniqueValue = (rows, field) => {
  const values = new Set(rows.map(row => value(row, field)).filter(Boolean));
  return values.size === 1 ? [...values][0] : null;
};

/** Use the local, date-appropriate catalogue only to fill missing source fields. */
export function createTherapyMeasureLookup(catalogRows, dd07vLookup) {
  const byCode = new Map();
  for (const row of catalogRows) {
    const code = value(row, 'TZTH_A_MAS');
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push({ row, from: date(value(row, 'TZTH_A_BG_DATE')), until: date(value(row, 'TZTH_A_END_DATE')) });
  }
  return row => {
    const code = value(row, 'TZTH_A_MAS'), client = value(row, 'MANDT');
    const on = date(value(row, 'TZTH_A_BDD'));
    let candidates = (byCode.get(code) ?? []).filter(entry => !on ||
      ((!entry.from || entry.from <= on) && (!entry.until || entry.until >= on))).map(entry => entry.row);
    if (client) candidates = candidates.filter(entry => !value(entry, 'MANDT') || value(entry, 'MANDT') === client);
    const rawType = value(row, 'TZTH_A_ART');
    const type = rawType ?? uniqueValue(candidates, 'TZTH_A_ART');
    if (type) candidates = candidates.filter(entry => !value(entry, 'TZTH_A_ART') || value(entry, 'TZTH_A_ART').toUpperCase() === type.toUpperCase());
    return {
      generalType: mapCredosTherapyType(type),
      subTypeCode: code,
      subType: value(row, 'TZTH_A_MAT') ?? uniqueValue(candidates, 'TZTH_A_MAT')
        ?? dd07vLookup?.resolve(['ZN2_TZTH_LB_MAS', 'ZN2_TZTH_A_MAS'], code, { fallbackToCode: false }) ?? code
    };
  };
}

/** Scalar UI summaries; original repeated source rows remain in supplementary. */
export function createSpecializedTherapyDetailCollector(dd07vLookup) {
  const summaries = new WeakMap();
  return (therapy, row) => {
    if (!therapy || !['nuclear', 'other'].includes(therapy.generalType)) return false;
    let summary = summaries.get(therapy);
    if (!summary) { summary = { procedures: new Map(), nuclides: new Map() }; summaries.set(therapy, summary); }
    // DD07V also includes numbered section headings, which are not procedures.
    const modern = value(row, 'TZTHSTAPA3');
    const field = modern && !/^[1-4]$/.test(modern) ? 'TZTHSTAPA3' : 'TZTHST_DOA';
    const procedure = value(row, field);
    if (procedure) {
      summary.procedures.set(procedure, dd07vLookup?.resolve([`ZN2_${field}`, field], procedure) ?? procedure);
      therapy.subTypeDetailCode = [...summary.procedures.keys()].join('; ');
      therapy.subTypeDetail = [...summary.procedures.values()].join('; ');
    }
    const nuclidCode = value(row, 'TZTHSTART3');
    const nuclid = resolveRadioNuclid({ radiationKindCode: nuclidCode, dd07vLookup });
    if (therapy.generalType === 'nuclear' && nuclid) {
      summary.nuclides.set(nuclidCode, nuclid);
      therapy.radioNuclidCode = [...summary.nuclides.keys()].join('; ');
      therapy.radioNuclid = [...summary.nuclides.values()].join('; ');
    }
    return true;
  };
}
