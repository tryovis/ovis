import fs from 'node:fs/promises';
import { createSchemaLookup, readOptionalExport } from './utils/schemaLookup.mjs';
import { value, matchesDocumentVersion, provenance } from './utils/rows.mjs';
import { keepLatestCredosDocumentVersions } from './utils/credosVersioning.mjs';
import { toOptionalCredosIsoDateOrNull as date } from './utils/dates.mjs';
import { mapHistologies } from './mappers/histologyMapper.mjs';
import { mapMolecularMarker } from './mappers/molecularMarkerMapper.mjs';
import { coreMappedFields, detailMappedFields } from './utils/mappedFields.mjs';
import { mapTnmsForRow } from './mappers/tnmMapper.mjs';

// These are source families, never a whitelist of category names or field values.
// Laboratory and Befundmerkmale are deliberately outside this import scope.
export const isExtensionSource = name => /^(tz(es|ey|vs|vy|th|pi|to|ts|sv)(_|$)|tzpbdiag$|tzboard$|tze_st$|bemerkungen$)/.test(name)
  && !/(?:^|_)(?:lab|bef|arzt)(?:_|$)/.test(name);
const technical = /^(?:__meta|MANDT|EINRI|DOKAR|DOKNR|DOKVR|DOKTL|MUSEQ|DTID|TZ_LOEKZ|TZ_P_PID|TZ_T_TID|TZ_HD_.*|TZ_LKR_.*|TZ_B_ARZ|TZ_B_ALX|TZPB_(?:PID|BFNR|LFNR|KNR|ERUSER|ERDATE|FALNR|FOE)|TZ_FALID|TZ_DKEY1|TZTK_THDNR|TZTK_ULTNR|TZPI_(?:R_.*|VRNR|KKNR|AVRNR|AKKNR))$/i;
const excludedField = /^(?:TZ_BEFB|TZ_BEF_|TZ_LAB)/i;
const eventDate = row => ['TZ_ALG_DAT', 'TZ_K_KL_DA', 'TZ_ZA_KL_D', 'TZ_DIA_DAT', 'TZ_D_HISDA', 'TZTHSYSDGV', 'TZTH_KP_DG', 'TZPB_UDATUM', 'TZ_TUBO_DAT', 'TZE_D_DIAD', 'TZV_B_BEUD', 'TZTH_A_BDD']
  .map(field => date(value(row, field))).find(Boolean) ?? null;

// Fields already represented by the original mappers. Remaining clinical fields
// are retained individually, with their original code as well as decoded text.
const alreadyMapped = new Set(`TZE_D_DIAD TZE_D_LOK TZE_D_LOKT TZE_D_HIS TZE_D_HIST TZES_D_GRA TZE_D_SEIT TZ_D_HISDA
TZV_B_BEUD TZV_B_GES TZV_B_LOK TZV_B_LYM TZV_B_FER
TZTH_A_ZIE TZTH_E_KLI TZTH_A_KLI TZTH_A_EDD TZTH_A_CHS TZTH_A_ART TZTH_A_MAT TZTH_A_R TZTH_DZ_OP TZTH_A_A TZTH_A_ACZ TZTH_A_SYD TZTH_A_CHW TZTH_A_BDD TZTH_A_PHA TZTH_A_ACL TZTH_A_SEI TZTH_A_MUL
TZTH_A_OPS TZTH_A_OPT TZTH_A_OP2 TZTH_A_OT2 TZTH_A_OP3 TZTH_A_OT3 TZTH_A_OP4 TZTH_A_OT4 TZTH_A_OP5 TZTH_A_OT5 TZTH_A_OP6 TZTH_A_OT6
TZ_ECOG`.split(/\s+/));

export async function buildCredosSchemaExtensions({ exportDir, parents, validPatients, getNumericTumorId,
  dd07vLookup, molecularMarkerLookup, therapyIdByDocumentNumber, therapies }) {
  const schema = await createSchemaLookup(exportDir, dd07vLookup);
  const tables = new Map(Object.entries(parents));
  for (const file of (await fs.readdir(exportDir)).sort()) {
    const name = file.replace(/\.txt$/i, '').toLowerCase();
    if (!/\.txt$/i.test(file) || !isExtensionSource(name) || tables.has(name)) continue;
    let rows = await readOptionalExport(exportDir, name);
    // Repeat rows (MUSEQ) must never be collapsed to one document.
    if (rows.length && !Object.hasOwn(rows[0], 'MUSEQ') && value(rows[0], 'DOKNR')) {
      rows = keepLatestCredosDocumentVersions(rows, { documentNumberField: 'DOKNR', documentVersionField: 'DOKVR', deleteFlagField: 'TZ_LOEKZ', deleteFlagValue: 'X' });
    }
    tables.set(name, rows);
  }
  const patients = new Set(validPatients.map(p => String(p.patID)));
  const documents = new Map();
  for (const [source, rows] of tables) for (const row of rows) {
    const key = value(row, 'DOKNR');
    if (!key || !value(row, 'TZ_P_PID') || Object.hasOwn(row, 'MUSEQ')) continue;
    if (!documents.has(key)) documents.set(key, []);
    documents.get(key).push({ row, source });
  }
  const output = { supplementary: [], status: [], histology: [], molecularMarker: [], tumorBoard: [], tnm: [], study: [] };
  const stats = { unresolvedRows: 0, unresolvedBySource: {}, obsoleteDetailRows: 0, patientOnlyPathologyRows: 0 };
  const therapyById = new Map(therapies.map(t => [t.therapyID, t]));
  const substances = new Map((await readOptionalExport(exportDir, 'zn2crsubstance')).map(row => [value(row, 'SUBSTANCE'), row]));
  const studyCatalog = new Map((await readOptionalExport(exportDir, 'zn2_studien')).map(row => [value(row, 'TZE_ST_ID'), row]));
  const externalClinics = await readOptionalExport(exportDir, 'zn2_cr_ausw_kl');
  const studies = new Map();
  const pathologyTumors = new Map();
  for (const row of Object.values(parents).flat()) {
    const reference = value(row, 'TZ_D_HISEN'), tumor = value(row, 'TZ_T_TID');
    if (!reference || !tumor) continue;
    const key = `${value(row, 'TZ_P_PID')}|${reference}`;
    if (!pathologyTumors.has(key)) pathologyTumors.set(key, new Set());
    pathologyTumors.get(key).add(tumor);
  }

  function contextFor(source, row) {
    let parent = row;
    if (!value(row, 'TZ_P_PID', 'TZPB_PID')) {
      let candidates = documents.get(value(row, 'DOKNR')) ?? [];
      // Detail table names normally extend their parent table's name.
      const family = candidates.filter(p => source.startsWith(`${p.source}_`));
      if (family.length) candidates = family;
      else if (source === 'tzto_kp_tk') candidates = candidates.filter(p => p.source.startsWith('tzto_'));
      const current = candidates.filter(p => matchesDocumentVersion(row, p.row));
      if (!current.length && candidates.length) { stats.obsoleteDetailRows++; return null; }
      const identities = new Set(current.map(p => `${value(p.row, 'TZ_P_PID')}|${value(p.row, 'TZ_T_TID')}`));
      if (identities.size !== 1) { stats.unresolvedRows++; stats.unresolvedBySource[source] = (stats.unresolvedBySource[source] ?? 0) + 1; return null; }
      parent = current[0].row;
    }
    const patID = value(parent, 'TZ_P_PID', 'TZPB_PID');
    if (!patients.has(patID) || value(row, 'TZ_LOEKZ') === 'X') return null;
    let tumorRaw = value(parent, 'TZ_T_TID');
    if (source === 'tzpbdiag') {
      const reference = value(row, 'TZPB_BFNR');
      const tumorMatches = pathologyTumors.get(`${patID}|${reference}`) ?? new Set();
      tumorRaw = tumorMatches.size === 1 ? [...tumorMatches][0] : null;
      if (!tumorRaw) stats.patientOnlyPathologyRows++;
    }
    const therapyDocument = source.startsWith('tzth') ? value(parent, 'DOKNR') : value(parent, 'TZ_HD_DONR');
    const therapyID = therapyIdByDocumentNumber.get(therapyDocument) ?? null;
    return { parent, patID, tumorID: tumorRaw ? getNumericTumorId(tumorRaw) : null, therapyID };
  }

  function addParticipation(id, ctx, recruitmentDate) {
    if (!id) return;
    const catalog = studyCatalog.get(id);
    // Namespace CREDOS study identities to avoid merging unrelated UTMS IDs.
    if (!studies.has(id)) studies.set(id, { studyID: `CREDOS:${id}`,
      shortname: value(catalog, 'TZE_ST_STUDIE') ?? id, type: value(catalog, 'TZE_ST_TYP'),
      eudract: value(catalog, 'TZE_ST_EUDRACT'), start: date(value(catalog, 'TZE_ST_BEGINN')), studyPatients: [] });
    const study = studies.get(id);
    if (!study.studyPatients.some(p => p.patID === ctx.patID && p.recruitmentDate === recruitmentDate))
      study.studyPatients.push({ patID: ctx.patID, recruitmentDate });
  }

  function supplement(source, row, ctx, type, status, fields, occurrenceDate = eventDate(row), rawValue = null) {
    if (status === null && !type) return;
    output.supplementary.push({ patID: ctx.patID, tumorID: ctx.tumorID, therapyID: ctx.therapyID,
      type, status, supplementaryOccurrenceDate: occurrenceDate, ...provenance(row, source, fields.join(',')),
      rawValue: rawValue ?? fields.map(field => value(row, field)).filter(v => v !== null).join(' | '),
      sourceValues: JSON.stringify(Object.fromEntries(fields.map(field => [field, value(row, field)]))),
      sourceReference: value(row, 'TZPB_BFNR'), sourceSequence: value(row, 'MUSEQ', 'TZPB_LFNR') });
  }

  for (const [source, rows] of tables) for (const row of rows) {
    if (!isExtensionSource(source)) continue;
    const ctx = contextFor(source, row);
    if (!ctx) continue;
    const used = new Set();
    const consume = (...fields) => fields.flat().forEach(f => used.add(f));
    const lookup = field => schema.resolve(source, field, value(row, field));
    const clinicalFields = Object.keys(row).filter(f => !technical.test(f) && !excludedField.test(f) && value(row, f) !== null);
    for (const [full, ...parts] of [
      ['TZ_GEN_DAT', 'TZ_GEN_DTG', 'TZ_GEN_DMN', 'TZ_GEN_DJH'],
      ['TZ_BERDATE', 'TZ_BERD_TG', 'TZ_BERD_MN', 'TZ_BERD_JH'],
      ['TZ_ALG_DAT', 'TZ_ALG_DTG', 'TZ_ALG_DMN', 'TZ_ALG_DJH'],
      ['TZ_DIA_DAT', 'TZ_DIA_DTG', 'TZ_DIA_DMN', 'TZ_DIA_DJH']
    ]) if (date(value(row, full)) || parts.every(f => /^0*$/.test(value(row, f) ?? ''))) consume(parts);
    if (source === 'tzth') {
      const therapy = therapyById.get(ctx.therapyID), clinic = value(row, 'TZTH_A_KLI', 'TZTH_E_KLI');
      if (therapy && clinic && externalClinics.some(c => value(c, 'AUSW_KL') === clinic && (!value(row, 'EINRI') || value(row, 'EINRI') === value(c, 'EINRI')))) therapy.internal = 'Andere Einrichtung';
    }
    // SAP exports dates both as one date and day/month/year components. Only
    // discard the components when the complete date is valid, or all are zero.
    for (const field of clinicalFields) {
      if (!field.endsWith('T')) continue;
      const stem = field.slice(0, -1), parts = [`${stem}T`, `${stem}M`, `${stem}J`];
      if (!parts.every(f => Object.hasOwn(row, f))) continue;
      const combined = [`${stem}D`, `${stem}DA`].some(f => date(value(row, f)));
      if (combined || parts.every(f => /^0*$/.test(value(row, f) ?? ''))) consume(parts);
    }

    // Generic classification tables: future categories and zero values survive.
    for (const [categoryField, statusField, dateField] of [
      ['TZ_ALG_KL', 'TZ_ALG_ST', 'TZ_ALG_DAT'], ['TZ_K_KLAS', 'TZ_K_STAD', 'TZ_K_KL_DA'], ['TZ_ZA_KLAS', 'TZ_ZA_STAD', 'TZ_ZA_KL_D']
    ]) {
      const category = value(row, categoryField), raw = value(row, statusField);
      if (category === null && raw === null) continue;
      const type = schema.category(category) ?? categoryField;
      if (/^ECOG(?:\b|_)/i.test(category ?? '') && ctx.tumorID !== null) {
        output.status.push({ patID: ctx.patID, tumorID: ctx.tumorID, type: 'ECOG', status: raw,
          statusOccurrenceDate: date(value(row, dateField)), ...provenance(row, source, statusField) });
      } else supplement(source, row, ctx, type, schema.stage(category, raw), [categoryField, statusField, dateField], date(value(row, dateField)), raw);
      consume(categoryField, statusField, dateField);
    }
    if (value(row, 'TZ_ECOG') !== null && ctx.tumorID !== null) output.status.push({ patID: ctx.patID, tumorID: ctx.tumorID,
      type: 'ECOG', status: value(row, 'TZ_ECOG'), statusOccurrenceDate: eventDate(row), ...provenance(row, source, 'TZ_ECOG') });
    if (ctx.tumorID !== null && /^(tzes|tzey|tzth|tzvs|tzvy|tzpbdiag)$/.test(source)) {
      output.histology.push(...mapHistologies(row, { ...ctx, source, dd07vLookup }));
      if (source === 'tzpbdiag') output.tnm.push(...mapTnmsForRow({ ...row, TZ_T_TID: ctx.tumorID }, { sourceType: source })
        .map(tnm => ({ ...tnm, patID: ctx.patID, ...provenance(row, source) })));
    }
    // Embedded category/stage pairs, including categories not in today's catalog.
    for (const field of clinicalFields) {
      const match = field.match(/^(.*)_KL(\d+)$/);
      if (!match) continue;
      const stageField = `${match[1]}_ST${match[2]}`;
      if (!Object.hasOwn(row, stageField)) continue;
      supplement(source, row, ctx, schema.category(value(row, field)), schema.stage(value(row, field), value(row, stageField)), [field, stageField], eventDate(row));
      consume(field, stageField);
    }
    for (const prefix of ['TZEY_K', 'TZVY_K']) for (const [suffix, label] of [['AST', 'Ann-Arbor'], ['ASY', 'Ann-Arbor: A/B-Symptomatik']]) {
      const field = `${prefix}_${suffix}`;
      if (value(row, field) !== null) { supplement(source, row, ctx, label, lookup(field), [field]); consume(field); }
    }

    if (source === 'tzth_gen') {
      const marker = mapMolecularMarker(row, { parentRow: ctx.parent, source, getNumericTumorId, dd07vLookup, molecularMarkerLookup });
      if (marker) output.molecularMarker.push({ ...marker, patID: ctx.patID, therapyID: ctx.therapyID, ...provenance(row, source) });
      consume('TZ_GEN_NAM', 'TZ_GEN_UNT', 'TZ_GEN_APR', 'TZ_GEN_VAR', 'TZ_GEN_SON', 'TZ_GEN_DAT');
    }
    if (source === 'tzth_sys' && clinicalFields.length) {
      const substance = substances.get(value(row, 'TZTHSYSWRK'));
      const name = value(substance, 'SUBSTANCE_TXT') ?? value(row, 'TZTHSYSWRK');
      const atc = value(row, 'TZTHSYSATC') ?? value(substance, 'ATC_CODE');
      const therapy = therapyById.get(ctx.therapyID);
      if (therapy && (name || atc)) therapy.substance = [...new Set([...(therapy.substance?.split('$') ?? []), `${name ?? ''}§${atc ?? ''}`])].join('$');
      // One row contains one related drug/dose/cycle observation; do not split it.
      const display = clinicalFields.map(f => `${f === 'TZTHSYSWRK' ? 'Wirkstoff' : schema.field(source, f).label ?? f}: ${f === 'TZTHSYSWRK' ? name : lookup(f)}`).join('; ');
      supplement(source, row, ctx, 'Systemtherapie: Substanz / Dosis / Zyklus', display, clinicalFields);
      consume(clinicalFields);
    }
    if (source === 'tzth_oa') {
      const therapy = therapyById.get(ctx.therapyID), code = value(row, 'TZTH_A_OAK');
      if (therapy && code && !(therapy.ops?.split('$') ?? []).some(op => op.split('§')[0] === code)) therapy.ops = [therapy.ops, `${code}§`].filter(Boolean).join('$');
      if (clinicalFields.length) { supplement(source, row, ctx, 'OPS: zusätzlicher Code / Version', clinicalFields.map(f => `${f}: ${lookup(f)}`).join('; '), clinicalFields); consume(clinicalFields); }
    }

    // Keep diagnostic result + execution state, and complication timing, together
    // with the investigation/complication in the same source row.
    if (/(?:_diag|_kp|_kp_tk|_icd|_pws|_tkpr|_tkpo|_tk|_tk2)$/.test(source) && clinicalFields.length) {
      const label = source.endsWith('_diag') ? 'Diagnostik: Ergebnis / Durchführung' : source.endsWith('_icd') ? 'Patient: zusätzliche ICD-Diagnose' : `CREDOS ${source}`;
      supplement(source, row, ctx, label, clinicalFields.map(f => `${schema.field(source, f).label ?? f}: ${lookup(f)}`).join('; '), clinicalFields);
      consume(clinicalFields);
    }

    // Main conference dates are real events even when the recommendation is empty.
    if (/^(tzes|tzey|tzvs|tzvy)$/.test(source)) {
      const boards = source.startsWith('tze')
        ? [['TZETK_PRDA', 'pre-therapeutic', 'tkpr', 'TZETK_PRTH', 'TZETK_PREM'], ['TZETK_PODA', 'post-therapeutic', 'tkpo', 'TZETK_POTH', 'TZETK_POEM']]
        : [['TZV_TK_DAT', 'Tumorkonferenz', 'tk', 'TZV_TK_TTH', 'TZV_TK_TEM'], ['TZV_TKDAT2', 'Tumorkonferenz', 'tk2', 'TZV_TK_TTH', 'TZV_TK_TEM']];
      for (const [dateField, type, suffix, treatmentField, recommendationField] of boards) {
        const details = (tables.get(`${source}_${suffix}`) ?? []).filter(d => value(d, 'DOKNR') === value(row, 'DOKNR') && matchesDocumentVersion(d, row));
        const recommendations = details.map(d => {
          const treatment = schema.resolve(`${source}_${suffix}`, treatmentField, value(d, treatmentField));
          const decision = schema.resolve(`${source}_${suffix}`, recommendationField, value(d, recommendationField));
          return [treatment, decision].filter(Boolean).join(': ');
        }).filter(Boolean);
        const occurrenceDate = date(value(row, dateField));
        if (ctx.tumorID !== null && (occurrenceDate || recommendations.length)) output.tumorBoard.push({ patID: ctx.patID, tumorID: ctx.tumorID, type,
          recommendation: recommendations.join('; ') || null, tumorBoardOccurrenceDate: occurrenceDate, ...provenance(row, source, dateField) });
        consume(dateField);
      }
    }
    if (source === 'tzboard' && date(value(row, 'TZ_TUBO_DAT'))) output.tumorBoard.push({ patID: ctx.patID, tumorID: ctx.tumorID,
      type: 'Tumorkonferenz', recommendation: null, tumorBoardOccurrenceDate: date(value(row, 'TZ_TUBO_DAT')), ...provenance(row, source) });

    if (source === 'tze_st') for (let i = 1; i <= 3; i++) {
      const fields = [`TZE_ST_ST${i}`, `TZE_ST_SB${i}`, `TZE_ST_SE${i}`, `TZE_ST_DB${i}`, `TZE_ST_DE${i}`];
      if (!fields.some(f => value(row, f) !== null)) continue;
      supplement(source, row, ctx, 'Studie: Zuordnung / Teilnahme / Zeitraum', fields.filter(f => value(row, f) !== null).map(f => `${f}: ${lookup(f)}`).join('; '), fields, date(value(row, `TZE_ST_DB${i}`)));
      consume(fields);
      // A recommendation/unknown flag must never create a participation.
      if (value(row, 'TZE_ST_STT') === 'J') addParticipation(value(row, `TZE_ST_ST${i}`), ctx, date(value(row, `TZE_ST_DB${i}`)));
    }
    if (source === 'tzboard' && value(row, 'TZ_STUD_TEIL') === 'J') addParticipation(value(row, 'TZ_STUD_KN'), ctx, date(value(row, 'TZ_STUD_BEG')));

    const mappedDetails = detailMappedFields[source.split('_').at(-1)];
    for (const field of clinicalFields) {
      if (used.has(field) || mappedDetails?.has(field) || (Object.hasOwn(parents, source) && (alreadyMapped.has(field) || coreMappedFields.has(field)))) continue;
      if (schema.field(source, field).datatype === 'DATS' && /^(?:0+|0000-00-00|00\.00\.0000)$/.test(value(row, field))) continue;
      const label = schema.field(source, field).label;
      supplement(source, row, ctx, label ? `${label} [${field}]` : `CREDOS ${source}.${field}`, lookup(field), [field]);
    }
  }
  // Additional patient-level clinical/demographic facts from NPAT. Address and
  // contact administration stay in the patient mapper rather than observations.
  const npat = keepLatestCredosDocumentVersions(await readOptionalExport(exportDir, 'npat'), { documentNumberField: 'doknr', documentVersionField: 'dokvr' });
  for (const row of npat) {
    const patID = value(row, 'PATNR');
    if (!patients.has(patID)) continue;
    for (const field of ['todkz', 'toddt', 'toddb', 'todur', 'natio']) {
      const raw = value(row, field);
      if (raw === null || (/^toddt$/.test(field) && !date(raw))) continue;
      supplement('npat', row, { patID, tumorID: null, therapyID: null }, `CREDOS npat.${field}`, schema.resolve('npat', field, raw), [field], date(value(row, 'toddt')));
    }
  }
  output.study = [...studies.values()];
  // Deliberately preserve source rows, including equal values on different visits.
  console.log(`CREDOS Schema-Erweiterung: ${JSON.stringify({ ...stats, ...Object.fromEntries(Object.entries(output).map(([k, v]) => [k, v.length])) })}`);
  return output;
}
