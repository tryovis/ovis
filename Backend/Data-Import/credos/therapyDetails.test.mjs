import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mapTherapy } from './mappers/therapyMapper.mjs';
import { buildCredosSchemaExtensions } from './schemaExtensions.mjs';
import { createTherapyMeasureLookup } from './utils/therapyDetails.mjs';

const labels = new Map([
  ['ZN2_TZTHSTAPA3/MPRRT', 'Peptid-Radio-Rezeptor-Therapie'],
  ['ZN2_TZTHSTAPA3/MSIRT', 'Selektive interne Radio-Therapie'],
  ['ZN2_TZTHST_DOA/RJT', 'Radiojod-Therapie'],
  ['ZN2_TZTH_LB_MAS/WAS', 'Wait and see']
]);
const dd07vLookup = { resolve(domains, code, { fallbackToCode = true } = {}) {
  for (const domain of domains) if (labels.has(`${domain}/${code}`)) return labels.get(`${domain}/${code}`);
  return fallbackToCode ? code ?? null : null;
} };

test('CREDOS therapy types match the specialized page filters and retain unknown categories', () => {
  for (const [raw, expected] of [['NUK', 'nuclear'], ['ATH', 'other'], ['PHT', 'other'],
    ['MET', 'systemic'], ['ST', 'radiation'], ['OP', 'operation'], ['TPL', 'TPL'], ['NEW', 'NEW'], [' nuk ', 'nuclear'], [' ', null]]) {
    const row = mapTherapy({ TZTH_A_ART: raw, TZTH_A_MAS: 'SOURCE_CODE', TZTH_A_MAT: 'Documented description' });
    assert.equal(row.generalType, expected);
    assert.equal(row.subTypeCode, 'SOURCE_CODE');
    assert.equal(row.subType, 'Documented description');
    assert.equal(row.radiopharmaceutical, null);
    assert.equal(row.radioNuclid, null);
  }
});

test('therapy catalogue fills gaps with matching client/date but never overwrites documented categories or labels', () => {
  const lookup = createTherapyMeasureLookup([
    { MANDT: '030', TZTH_A_MAS: 'X', TZTH_A_ART: 'ATH', TZTH_A_MAT: 'Old name', TZTH_A_END_DATE: '31.12.2020' },
    { MANDT: '030', TZTH_A_MAS: 'X', TZTH_A_ART: 'NUK', TZTH_A_MAT: 'Current name', TZTH_A_BG_DATE: '01.01.2021' },
    { MANDT: '999', TZTH_A_MAS: 'X', TZTH_A_ART: 'PHT', TZTH_A_MAT: 'Different client' },
    { TZTH_A_MAS: 'AMB', TZTH_A_ART: 'ATH', TZTH_A_MAT: 'Ambiguous name A' },
    { TZTH_A_MAS: 'AMB', TZTH_A_ART: 'NUK', TZTH_A_MAT: 'Ambiguous name B' }
  ], dd07vLookup);
  const source = { MANDT: '030', TZTH_A_MAS: 'X', TZTH_A_BDD: '20240101' };
  assert.deepEqual(lookup(source), { generalType: 'nuclear', subTypeCode: 'X', subType: 'Current name' });
  assert.equal(lookup({ ...source, TZTH_A_ART: 'nuk' }).subType, 'Current name');
  assert.equal(lookup({ ...source, TZTH_A_BDD: '20200101' }).generalType, 'other');
  assert.equal(lookup({ ...source, TZTH_A_ART: 'OP', TZTH_A_MAT: 'Original description' }).subType, 'Original description');
  assert.equal(lookup({ ...source, TZTH_A_ART: 'OP' }).generalType, 'operation');
  assert.equal(lookup({ ...source, TZTH_A_ART: 'FUTURE_TYPE' }).generalType, 'FUTURE_TYPE');
  assert.equal(lookup({ ...source, MANDT: 'unmatched' }).generalType, null);
  assert.equal(lookup({ TZTH_A_MAS: 'AMB' }).generalType, null);
  assert.equal(lookup({ TZTH_A_MAS: 'AMB' }).subType, 'AMB');
  assert.equal(lookup({ TZTH_A_MAS: 'WAS' }).subType, 'Wait and see');
});

test('specialized therapy details use current document versions and preserve repeated row relationships', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'credos-therapy-details-'));
  try {
    await fs.writeFile(path.join(dir, 'zn2_cr_th_mas.txt'), 'MANDT$TZTH_A_MAS$TZTH_A_ART$TZTH_A_MAT\n030$RAJ$NUK$Radiojod-Therapie\n');
    await fs.writeFile(path.join(dir, 'tzth_str.txt'), [
      'DOKNR$DOKVR$MUSEQ$TZTHSTAPA3$TZTHST_DOA$TZTHSTART3$TZTHST_EDO$TZTHST_EHD$TZTHST_DGV$TZ_LOEKZ',
      't1$1$1$obsolete$$Ra-223$8$GBq$20230101$',
      't1$02$1$MPRRT$$Lu-177$7$GBq$20240101$',
      't1$2$2$MPRRT$$Lu-177$8$GBq$20240201$',
      't1$2$3$MSIRT$$Y-90$9$GBq$20240301$',
      't1$2$4$future-procedure$$UH$$$$',
      't1$2$5$deleted$$Ra-223$$$$X',
      't2$2$1$$RJT$$$$$',
      't3$2$1$future-other$$$$$$',
      't4$2$1$MPRRT$$Lu-177$$$$',
      't6$2$1$3$RJT$J-131$$$$',
      'missing$2$1$MPRRT$$Lu-177$$$$'
    ].join('\n'));
    const parentRows = ['NUK', 'ATH', 'PHT', 'ST', 'FUTURE_TYPE', null].map((type, i) => ({
      DOKNR: `t${i + 1}`, DOKVR: '2', MANDT: '030', TZ_P_PID: 'p', TZ_T_TID: '10', TZTH_A_ART: type,
      TZTH_A_MAS: i === 5 ? 'RAJ' : 'documented-code', TZTH_A_MAT: i === 5 ? null : 'Original name', TZTH_A_BDD: '20240101'
    }));
    const therapies = parentRows.map((row, i) => mapTherapy(row, { therapyID: i + 1, dd07vLookup }));
    const result = await buildCredosSchemaExtensions({ exportDir: dir, parents: { tzth: parentRows },
      validPatients: [{ patID: 'p' }], getNumericTumorId: Number, dd07vLookup,
      therapyIdByDocumentNumber: new Map(parentRows.map((row, i) => [row.DOKNR, i + 1])), therapies, log() {} });
    assert.equal(therapies.filter(row => row.generalType === 'nuclear').length, 2);
    assert.equal(therapies.filter(row => row.generalType === 'other').length, 2);
    assert.equal(therapies[0].subTypeDetailCode, 'MPRRT; MSIRT; future-procedure');
    assert.equal(therapies[0].subTypeDetail, 'Peptid-Radio-Rezeptor-Therapie; Selektive interne Radio-Therapie; future-procedure');
    assert.equal(therapies[0].radioNuclidCode, 'Lu-177; Y-90');
    assert.equal(therapies[0].radioNuclid, 'Lutetium (Lu-177); Yttrium (Y-90)');
    assert.equal(therapies[0].subType, 'Original name');
    assert.equal(therapies[1].subTypeDetail, 'Radiojod-Therapie');
    assert.equal(therapies[2].subTypeDetailCode, 'future-other');
    assert.equal(therapies[3].generalType, 'radiation', 'a detail never reclassifies an explicitly documented therapy');
    assert.equal(therapies[3].radioNuclid, null);
    assert.equal(therapies[4].generalType, 'FUTURE_TYPE');
    assert.equal(therapies[5].subType, 'Radiojod-Therapie');
    assert.equal(therapies[5].subTypeDetailCode, 'RJT', 'section heading must not become a procedure');
    assert.equal(therapies[5].radioNuclidCode, 'J-131');
    assert.ok(therapies.every(row => row.radiopharmaceutical === null && row.radiopharmaceuticalCode === null));
    const details = result.supplementary.filter(row => row.type === 'Therapie: Verfahren / Nuklid / Dosis' && row.therapyID === 1);
    assert.equal(details.length, 4);
    assert.deepEqual(details.map(row => row.sourceSequence), ['1', '2', '3', '4']);
    assert.deepEqual(details.slice(0, 2).map(row => JSON.parse(row.sourceValues).TZTHST_EDO), ['7', '8']);
    assert.equal(details[1].supplementaryOccurrenceDate, '2024-02-01T00:00:00Z');
    assert.equal(details[0].sourceVersion, '02');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
