// Synthetic data only. Run with:
// node --max-old-space-size=384 Backend/Data-Import/credos/benchmarks/schemaExtensions.mjs 100000
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildCredosSchemaExtensions } from '../schemaExtensions.mjs';
import { createJsonCollectionSpool } from '../utils/jsonCollectionSpool.mjs';

const count = Number(process.argv[2] ?? 100000);
if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Expected a positive document count');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credos-benchmark-'));
let spool;
try {
  const parents = { tzes: [] };
  const handle = await fs.open(path.join(directory, 'tzes_tkpr.txt'), 'w');
  try {
    await handle.write('DOKNR$DOKVR$MUSEQ$TZETK_PRTH$TZETK_PREM\n');
    let lines = [];
    for (let i = 0; i < count; i++) {
      parents.tzes.push({ DOKNR: String(i), DOKVR: '2', TZ_P_PID: 'synthetic', TZ_T_TID: String(i + 1),
        ...Object.fromEntries(Array.from({ length: 8 }, (_, j) => [`FUTURE_${j}`, `${i}-${j}`])) });
      lines.push(`${i}$1$1$obsolete$ignore\n${i}$02$1$OP$yes\n${i}$2$2$RT$no\n`);
      if (lines.length === 1000) { await handle.write(lines.join('')); lines = []; }
    }
    if (lines.length) await handle.write(lines.join(''));
  } finally { await handle.close(); }
  spool = await createJsonCollectionSpool(path.join(directory, 'omock.json'));
  let batches = 0, maxBatch = 0, peakRss = process.memoryUsage().rss;
  const start = performance.now();
  await buildCredosSchemaExtensions({ exportDir: directory, parents,
    validPatients: [{ patID: 'synthetic' }], getNumericTumorId: Number,
    therapyIdByDocumentNumber: new Map(), therapies: [],
    async onBatch(batch) {
      maxBatch = Math.max(maxBatch, Object.values(batch).reduce((n, rows) => n + rows.length, 0));
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      batches++;
      await spool.append(batch);
    }
  });
  assert.equal(spool.count('tumorBoard'), count);
  assert.equal(spool.count('supplementary'), count * 10);
  assert.ok(maxBatch <= 1008);
  let bytes = 0;
  const sink = { async write(chunk) { bytes += Buffer.byteLength(chunk); } };
  await spool.copyTo('tumorBoard', sink, false);
  await spool.copyTo('supplementary', sink, false);
  console.log(JSON.stringify({ documents: count, conferenceDetails: count * 3, observations: count * 11,
    seconds: Number(((performance.now() - start) / 1000).toFixed(2)), peakRssMiB: Math.round(peakRss / 1024 / 1024),
    batches, maxBatch, outputMiB: Math.round(bytes / 1024 / 1024) }));
} finally {
  await spool?.dispose();
  await fs.rm(directory, { recursive: true, force: true });
}
