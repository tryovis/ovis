// credosDollarParser.mjs
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from 'node:path';

/**
 * Liest eine CREDOS-Exportdatei, die wie CSV aufgebaut ist,
 * aber "$" als Trenner verwendet.
 *
 * Erwartung:
 * - erste Zeile = Header
 * - folgende Zeilen = Daten
 */
export async function parseCredosDollarFile(filePath, options = {}) {
  const rows = [];
  for await (const row of iterateCredosDollarFile(filePath, options)) rows.push(row);
  return rows;
}

// Also expose rows incrementally for consumers that do not need the whole file.
export async function* iterateCredosDollarFile(filePath, options = {}) {
  const {
    delimiter = "$",
    encoding = "utf8",
    trimValues = true,
    emptyAsNull = true,
    onWarning = message => console.warn(message)
  } = options;

  const input = createReadStream(filePath, { encoding });
  const lines = createInterface({
    input,
    crlfDelay: Infinity
  });

  let headers = null;
  let nonEmptyLineNumber = 0;
  let pending = null;
  let malformed = 0;

  const startsDocument = values => headers[0]?.toUpperCase() === 'MANDT'
    && headers.some(h => h.toUpperCase() === 'DOKNR')
    && /^\d{3}$/.test(values[0]?.trim() ?? '')
    && Boolean(values[headers.findIndex(h => h.toUpperCase() === 'DOKNR')]?.trim());

  function makeRow(values, lineNumber) {
    const row = {};
    headers.forEach((header, index) => {
      let value = values[index];
      if (trimValues) value = value.trim();
      if (emptyAsNull && value === '') value = null;
      row[header] = value;
    });
    row.__meta = { sourceFile: filePath, lineNumber };
    return row;
  }

  try {
    for await (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (line.trim() === "") {
        continue;
      }

      nonEmptyLineNumber += 1;

      if (!headers) {
        headers = line
          .split(delimiter)
          .map(header => header.trim());
        continue;
      }

      const values = line.split(delimiter);
      if (pending && startsDocument(values)) { malformed++; pending = null; }
      if (pending) {
        pending.values[pending.values.length - 1] += `\n${values[0]}`;
        pending.values.push(...values.slice(1));
        if (pending.values.length === headers.length) { yield makeRow(pending.values, pending.lineNumber); pending = null; }
        else if (pending.values.length > headers.length) { malformed++; pending = null; }
      } else if (values.length === headers.length) yield makeRow(values, nonEmptyLineNumber);
      else if (values.length < headers.length && startsDocument(values)) pending = { values, lineNumber: nonEmptyLineNumber };
      else malformed++;
    }

    if (pending) malformed++;
    if (malformed) onWarning?.(`CREDOS ${path.basename(filePath)}: ${malformed} Zeilen mit uneindeutiger Spaltenzahl ausgelassen (keine verschobenen Feldzuordnungen).`);

  } finally {
    // A caller may stop after the first row to inspect the schema.
    lines.close();
    input.destroy();
  }
}
