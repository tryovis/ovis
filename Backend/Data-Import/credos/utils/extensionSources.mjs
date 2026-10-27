import fs from 'node:fs/promises';
import path from 'node:path';
import { iterateCredosDollarFile } from '../credosDollarParser.mjs';
import { keepLatestCredosDocumentVersions } from './credosVersioning.mjs';
import { value } from './rows.mjs';

const isBoardSource = source => /^(?:tzes|tzey)_(?:tkpr|tkpo)$|^(?:tzvs|tzvy)_(?:tk|tk2)$/.test(source);
const contextFields = ['DOKNR', 'DOKVR', 'TZ_LOEKZ', 'TZ_P_PID', 'TZ_T_TID', 'TZ_HD_DONR'];
const needsVersionSelection = row => row && !Object.hasOwn(row, 'MUSEQ') && value(row, 'DOKNR');

/** Retain only join contexts and conference indexes, not all extension tables. */
export async function prepareExtensionSources(exportDir, parents, include, report = () => {}) {
  const sources = new Map(Object.keys(parents).map(source => [source, null]));
  for (const file of (await fs.readdir(exportDir)).sort()) {
    const source = file.replace(/\.txt$/i, '').toLowerCase();
    if (/\.txt$/i.test(file) && include(source) && !sources.has(source)) sources.set(source, path.join(exportDir, file));
  }
  const documents = new Map();
  const boards = new Map();
  function addDocuments(source, rows) {
    for (const row of rows) {
      const key = value(row, 'DOKNR');
      if (!key || !value(row, 'TZ_P_PID') || Object.hasOwn(row, 'MUSEQ')) continue;
      if (!documents.has(key)) documents.set(key, []);
      documents.get(key).push({ source, row });
    }
  }
  for (const [source, rows] of Object.entries(parents)) addDocuments(source, rows);
  for (const [source, file] of sources) {
    if (!file) continue;
    const boardIndex = isBoardSource(source) ? new Map() : null;
    const contexts = [], boardRows = [];
    let first = true, hasContexts = false, selectVersions = false, processed = 0;
    report(`Index: ${source}`);
    for await (const row of iterateCredosDollarFile(file, { onWarning: null })) {
      if (first) {
        hasContexts = !Object.hasOwn(row, 'MUSEQ') && (Object.hasOwn(row, 'TZ_P_PID') || Object.hasOwn(row, 'tz_p_pid'));
        selectVersions = needsVersionSelection(row);
        first = false;
      }
      if (!hasContexts && !boardIndex) break;
      if (hasContexts) contexts.push(Object.fromEntries(contextFields.flatMap(field =>
        [field, field.toLowerCase()].filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]))));
      if (boardIndex) boardRows.push(row);
      if (++processed % 10000 === 0) report(`Index: ${source}, ${processed} Zeilen`, false);
    }
    addDocuments(source, selectVersions ? keepLatestCredosDocumentVersions(contexts) : contexts);
    if (boardIndex) {
      for (const row of selectVersions ? keepLatestCredosDocumentVersions(boardRows) : boardRows) {
        const document = value(row, 'DOKNR');
        if (!boardIndex.has(document)) boardIndex.set(document, []);
        boardIndex.get(document).push(row);
      }
      boards.set(source, boardIndex);
    }
  }
  async function* rows(source) {
    const file = sources.get(source);
    if (!file) { yield* parents[source]; return; }
    // Detail rows stream directly. Standalone documents still select the latest
    // version before emitting any facts, including deleted latest documents.
    const iterator = iterateCredosDollarFile(file);
    try {
      const first = await iterator.next();
      if (first.done) return;
      if (needsVersionSelection(first.value)) {
        const all = [first.value];
        for await (const row of iterator) all.push(row);
        yield* keepLatestCredosDocumentVersions(all);
      } else {
        yield first.value;
        yield* iterator;
      }
    } finally { await iterator.return(); }
  }
  return { names: sources.keys(), rows, documents, boards };
}
