import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildCredosSchemaExtensions } from './schemaExtensions.mjs';
import { createJsonCollectionSpool } from './utils/jsonCollectionSpool.mjs';
import { prepareExtensionSources } from './utils/extensionSources.mjs';
import { iterateCredosDollarFile } from './credosDollarParser.mjs';

test('streaming batches preserve contents, ordering, versions and repeated conference recommendations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'credos-stream-'));
  let spool;
  try {
    const parents = { tzes: Array.from({ length: 1200 }, (_, i) => ({ DOKNR: `d${i}`, DOKVR: '2', TZ_P_PID: 'p', TZ_T_TID: String(i + 1), UNKNOWN: '0' })) };
    let documentReads = 0;
    for (const row of parents.tzes) {
      const document = row.DOKNR;
      Object.defineProperty(row, 'DOKNR', { enumerable: true, get() { documentReads++; return document; } });
    }
    const details = ['DOKNR$DOKVR$MUSEQ$TZETK_PRTH$TZETK_PREM'];
    for (let i = 0; i < 1200; i++) details.push(`d${i}$1$1$old$ignored`, `d${i}$02$1$OP$yes`, `d${i}$2$2$RT$no`);
    await fs.writeFile(path.join(dir, 'tzes_tkpr.txt'), details.join('\n'));
    await fs.writeFile(path.join(dir, 'tzes_organ.txt'), 'DOKNR$DOKVR$TZ_P_PID$TZ_T_TID$TZ_LOEKZ$UNKNOWN\no$1$p$9$$old\no$2$p$10$$new\nx$1$p$11$$old\nx$2$p$11$X$deleted\n');
    await fs.writeFile(path.join(dir, 'tzes_organ_detail.txt'), 'DOKNR$DOKVR$MUSEQ$UNKNOWN\no$2$1$current detail\no$1$1$obsolete detail\nx$2$1$deleted parent\n');
    const options = { exportDir: dir, parents, validPatients: [{ patID: 'p' }], getNumericTumorId: Number, therapyIdByDocumentNumber: new Map(), therapies: [], log() {} };
    const expected = await buildCredosSchemaExtensions(options);
    assert.ok(documentReads < parents.tzes.length * 100, 'conference joins must not rescan every detail for every parent');
    assert.equal(expected.tumorBoard.length, 1200);
    assert.equal(expected.tumorBoard[0].recommendation, 'OP: yes; RT: no');
    const organDetail = expected.supplementary.filter(row => row.source === 'tzes_organ_detail');
    assert.equal(organDetail.length, 1);
    assert.equal(organDetail[0].tumorID, 10);
    spool = await createJsonCollectionSpool(path.join(dir, 'omock.json'));
    let batches = 0, largestBatch = 0;
    const result = await buildCredosSchemaExtensions({ ...options, async onBatch(batch) {
      batches++;
      largestBatch = Math.max(largestBatch, Object.values(batch).reduce((sum, rows) => sum + rows.length, 0));
      await spool.append(batch);
    } });
    assert.ok(batches > 3);
    assert.ok(largestBatch <= 1002, 'pending output stays bounded by the batch limit plus one source row');
    for (const [key, rows] of Object.entries(expected)) {
      assert.equal(result[key].length, 0, 'flushed output is released');
      assert.equal(spool.count(key), rows.length);
      // Exercise separators both with and without an existing core collection.
      for (const prefix of [[], [{ core: 'existing ä 🧬' }]]) {
        const file = path.join(dir, `${key}-${prefix.length}.json`);
        const handle = await fs.open(file, 'w');
        try {
          await handle.write(JSON.stringify(prefix).slice(0, -1));
          await spool.copyTo(key, handle, prefix.length > 0);
          await handle.write(']');
        } finally { await handle.close(); }
        assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), [...prefix, ...rows]);
      }
    }
    await spool.dispose(); spool = null;
    assert.ok(!(await fs.readdir(dir)).some(name => name.startsWith('.credos-collections-')));
  } finally {
    await spool?.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('conference indexes retain standalone latest-version behavior and unrelated sources stream lazily', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'credos-index-'));
  try {
    await fs.writeFile(path.join(dir, 'tzes_tkpr.txt'), 'DOKNR$DOKVR$TZETK_PRTH\nd$1$old\nd$2$current\n');
    await fs.writeFile(path.join(dir, 'tzth_sys.txt'), 'DOKNR$DOKVR$MUSEQ$VALUE\nd$2$1$before\n');
    const sources = await prepareExtensionSources(dir, {}, () => true);
    assert.deepEqual(sources.boards.get('tzes_tkpr').get('d').map(row => row.TZETK_PRTH), ['current']);
    await fs.writeFile(path.join(dir, 'tzth_sys.txt'), 'DOKNR$DOKVR$MUSEQ$VALUE\nd$2$1$after\n');
    const rows = [];
    for await (const row of sources.rows('tzth_sys')) rows.push(row);
    assert.equal(rows[0].VALUE, 'after', 'detail tables are read during processing, not retained in preparation');
    const iterator = iterateCredosDollarFile(path.join(dir, 'tzth_sys.txt'));
    await iterator.next();
    await iterator.return();
    await fs.unlink(path.join(dir, 'tzth_sys.txt'));
    await assert.rejects(async () => { for await (const row of sources.rows('tzth_sys')) void row; }, { code: 'ENOENT' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('sink failures abort the import instead of silently dropping observations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'credos-sink-'));
  try {
    const error = new Error('simulated disk full');
    await assert.rejects(buildCredosSchemaExtensions({ exportDir: dir,
      parents: { tzpi: [{ DOKNR: 'p', TZ_P_PID: 'p', UNKNOWN: '0' }] },
      validPatients: [{ patID: 'p' }], getNumericTumorId: Number, therapyIdByDocumentNumber: new Map(), therapies: [], log() {},
      async onBatch() { throw error; }
    }), candidate => candidate === error);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
