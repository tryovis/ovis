import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

/** Temporary, comma-separated JSON fragments; no complete collection in RAM. */
export async function createJsonCollectionSpool(outputPath) {
  const directory = await fs.mkdtemp(path.join(path.dirname(outputPath), '.credos-collections-'));
  const entries = new Map();
  return {
    count(name) { return entries.get(name)?.count ?? 0; },
    async append(batch) {
      for (const [name, rows] of Object.entries(batch)) {
        if (!rows.length) continue;
        let entry = entries.get(name);
        if (!entry) {
          // Names are internal collection keys, never export field values.
          if (!/^[a-zA-Z]+$/.test(name)) throw new Error('Invalid collection name');
          entry = { file: path.join(directory, `${name}.jsonpart`), count: 0 };
          entries.set(name, entry);
        }
        let chunks = [], characters = 0;
        for (const row of rows) {
          const chunk = `${entry.count++ ? ',' : ''}${JSON.stringify(row ?? null)}`;
          chunks.push(chunk);
          characters += chunk.length;
          if (characters >= 1024 * 1024) {
            await fs.appendFile(entry.file, chunks.join(''));
            chunks = []; characters = 0;
          }
        }
        if (chunks.length) await fs.appendFile(entry.file, chunks.join(''));
      }
    },
    async copyTo(name, handle, hasPreviousRows) {
      const entry = entries.get(name);
      if (!entry?.count) return;
      if (hasPreviousRows) await handle.write(',');
      for await (const chunk of createReadStream(entry.file, { encoding: 'utf8' })) await handle.write(chunk);
    },
    async dispose() {
      // Only remove this invocation's uniquely created staging directory.
      await fs.rm(directory, { recursive: true, force: true });
    }
  };
}
