import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildCredosSchemaExtensions } from './schemaExtensions.mjs';
import { mapTherapy } from './mappers/therapyMapper.mjs';
import { mapTnmsForRow } from './mappers/tnmMapper.mjs';
import { mapTumorBoardsForRow } from './mappers/tumorBoardMapper.mjs';
import { toOptionalCredosIsoDateOrNull as date } from './utils/dates.mjs';
import { materializeHistologyDocuments, deriveGradingFeatures } from '../../MongoDB/Preprocessing/histologyModel.mjs';
import { mapCredosGrading } from './utils/grading.mjs';
import { mapConsultation } from './mappers/consultationMapper.mjs';

test('schema extensions preserve arbitrary categories, zero, row relations and only current versions', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'credos-schema-'));
  const write = (name, content) => fs.writeFile(path.join(dir, `${name}.txt`), `${content}\n`);
  try {
    await write('tzes_alg', 'DOKNR$DOKVR$MUSEQ$TZ_ALG_KL$TZ_ALG_ST$TZ_ALG_DAT\nd1$01$1$old$1$20200101\nd1$02$1$FUTURE_SCORE$0$20240101\nd1$02$2$FUTURE_SCORE$changed$20240201');
    await write('tzpi_za', 'DOKNR$DOKVR$MUSEQ$TZ_ZA_KLAS$TZ_ZA_STAD\np1$1$1$NEW_PATIENT_CATEGORY$N');
    await write('tzes_lab', 'DOKNR$DOKVR$MUSEQ$TZ_LAB_ART$TZ_LAB_MNG\nd1$2$1$lab$999');
    await write('tzes_bef', 'DOKNR$DOKVR$MUSEQ$TZ_BEFBTXT$TZ_BEFB_ST\nd1$2$1$befund$yes');
    await write('tzth_sys', 'DOKNR$DOKVR$MUSEQ$TZTHSYSWRK$TZTHSYSATC$TZTHSYSDOS$TZTHSYSEHT$TZTHSYSZNR\nt1$1$1$drug-A$ATC-A$0$mg$1\nt1$1$2$drug-B$ATC-B$20$mg$2');
    await write('tzth_oa', 'DOKNR$DOKVR$MUSEQ$TZTH_A_OAK$TZTH_A_OAV\nt1$1$1$5-123$2025');
    await write('tzth_gen', 'DOKNR$DOKVR$MUSEQ$TZ_GEN_NAM$TZ_GEN_APR\nt1$1$1$FUTURE_MARKER$N');
    await write('npat', 'patnr$doknr$dokvr$todkz$natio\np1$np1$1$N$future-nationality');
    await write('zn2_cr_ausw_kl', 'EINRI$AUSW_KL\nsite$EXTERNAL');
    await write('tzpbdiag', 'TZPB_PID$TZPB_BFNR$TZPB_D_HIS$TZPB_D_HIST$TZPB_D_GRA\np1$unlinked$8000/3$Unknown tumor reference$G2\np1$report-1$8140/3$Known reference$G3');
    await write('tzes_bz', 'DOKNR$DOKVR$TZ_P_PID$TZ_T_TID$FUTURE_ORGAN_FIELD$TZ_BEFB_X\no1$1$p1$10$0$excluded');
    await write('bemerkungen', 'doknr$dokvr$bemerkungen\nd1$1$old note\nd1$2$current note');
    const parents = { tzes: [{ DOKNR: 'd1', DOKVR: '2', TZ_P_PID: 'p1', TZ_T_TID: '10', TZ_ECOG: '0', TZE_D_DIAD: '20240101', TZ_D_HISEN: 'report-1' }],
      tzpi: [{ DOKNR: 'p1', DOKVR: '1', TZ_P_PID: 'p1' }],
      tzth: [{ DOKNR: 't1', DOKVR: '1', TZ_P_PID: 'p1', TZ_T_TID: '10', TZTH_A_KLI: 'EXTERNAL' }] };
    const therapies = [{ therapyID: 7, substance: null, ops: null }];
    const result = await buildCredosSchemaExtensions({ exportDir: dir, parents, validPatients: [{ patID: 'p1' }], getNumericTumorId: Number,
      therapyIdByDocumentNumber: new Map([['t1', 7]]), therapies });
    const scores = result.supplementary.filter(s => s.type === 'FUTURE_SCORE');
    assert.deepEqual(scores.map(s => s.status), ['0', 'changed']);
    assert.deepEqual(scores.map(s => s.sourceSequence), ['1', '2']);
    assert.equal(scores[1].supplementaryOccurrenceDate, '2024-02-01T00:00:00Z');
    assert.equal(result.status[0].status, '0');
    assert.ok(!result.supplementary.some(s => /lab|bef/i.test(s.source) || /TZ_BEFB/.test(s.sourceField)));
    const patientOnly = result.supplementary.find(s => s.type === 'NEW_PATIENT_CATEGORY');
    assert.equal(patientOnly.patID, 'p1'); assert.equal(patientOnly.tumorID, null);
    const drugs = result.supplementary.filter(s => s.source === 'tzth_sys');
    assert.equal(drugs.length, 2); assert.equal(drugs[0].therapyID, 7);
    assert.equal(JSON.parse(drugs[0].sourceValues).TZTHSYSDOS, '0');
    assert.equal(JSON.parse(drugs[1].sourceValues).TZTHSYSWRK, 'drug-B');
    assert.equal(therapies[0].substance, 'drug-A§ATC-A$drug-B§ATC-B');
    assert.equal(therapies[0].ops, '5-123§');
    assert.equal(therapies[0].internal, 'Andere Einrichtung');
    assert.ok(result.supplementary.some(s => s.source === 'npat' && s.status === 'future-nationality' && s.tumorID === null));
    assert.equal(result.molecularMarker[0].type, 'FUTURE_MARKER');
    assert.equal(result.histology.length, 1, 'only explicitly linked pathology receives a tumor');
    assert.equal(result.histology[0].ICDO_histologyCode, '8140/3');
    assert.equal(result.histology[0].ICDO_grading, '3');
    assert.equal(result.histology[0].tumorID, 10);
    assert.ok(result.supplementary.some(s => s.source === 'tzpbdiag' && s.patID === 'p1' && s.tumorID === null));
    assert.equal(result.supplementary.find(s => s.sourceField === 'FUTURE_ORGAN_FIELD').rawValue, '0');
    assert.deepEqual(result.supplementary.filter(s => s.source === 'bemerkungen').map(s => s.status), ['current note']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('clinical fields survive mapping and histology materialization', () => {
  const therapy = mapTherapy({ TZ_T_TID: '10', TZTH_A_ACL: '3rd', TZTH_A_PHA: 'future-phase', TZTH_A_SEI: 'L', TZTH_A_MUL: '0' }, { therapyID: 7 });
  assert.equal(therapy.therapyLine, '3rd'); assert.equal(therapy.phase, 'future-phase'); assert.equal(therapy.combination, '0');
  assert.equal(mapConsultation({ TZ_BER_ART: 'future-consultation', TZ_BER_STA: 'future-status' }).type, 'future-consultation');
  const tnms = mapTnmsForRow({ TZ_T_TID: '10', TZES_KKUIC: 'IV', TZ_K_KTNMV: '9', TZ_K_KTNMD: '20250228', TZE_D_DIAD: '20240101' }, { sourceType: 'tzes' });
  assert.equal(tnms[0].UICC, 'IV'); assert.equal(tnms[0].version, '9'); assert.equal(tnms[0].tnmOccurrenceDate, '2025-02-28T00:00:00Z');
  const [histology] = materializeHistologyDocuments([{ tumorID: 10, ICDO_histologyCode: '8000/3', ICDO_grading: 'G2' }]);
  assert.equal(histology.ICDO_grading, 'G2');
  assert.equal(mapCredosGrading('G2'), '2');
  assert.equal(deriveGradingFeatures([{ ICDO_grading: null }, { ICDO_grading: mapCredosGrading('G2') }]).grading_first, '2');
  assert.deepEqual(mapTumorBoardsForRow({ TZ_T_TID: '10' }, { sourceType: 'tzey' }), []);
  assert.equal(mapTumorBoardsForRow({ TZ_T_TID: '10', TZES_TBTTD: '20250228', TZES_TBTTO: 'X', TZES_TBTTC: 'N' }, { sourceType: 'tzes_tb' })[0].recommendation, 'OP');
  for (const invalid of ['00000000', '20250000', '20250229', '31.04.2025']) assert.equal(date(invalid), null);
  assert.equal(date('29.02.2024'), '2024-02-29T00:00:00Z');
});

test('CREDOS study recommendations and positive participation remain distinct', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'credos-study-'));
  try {
    await fs.writeFile(path.join(dir, 'tze_st.txt'), 'DOKNR$DOKVR$TZ_P_PID$TZ_T_TID$TZE_ST_STT$TZE_ST_ST1$TZE_ST_DB1\na$1$p1$10$N$recommended$20240101\nb$1$p1$10$J$enrolled$20240201\n');
    const result = await buildCredosSchemaExtensions({ exportDir: dir, parents: {}, validPatients: [{ patID: 'p1' }], getNumericTumorId: Number,
      therapyIdByDocumentNumber: new Map(), therapies: [] });
    assert.equal(result.study.length, 1); assert.equal(result.study[0].studyID, 'CREDOS:enrolled');
    assert.equal(result.study[0].studyPatients[0].recruitmentDate, '2024-02-01T00:00:00Z');
    assert.ok(result.supplementary.some(s => s.rawValue.includes('recommended')));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
