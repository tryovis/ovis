// credosDollarParser.mjs
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";

/**
 * Liest eine CREDOS-Exportdatei, die wie CSV aufgebaut ist,
 * aber "$" als Trenner verwendet.
 *
 * Erwartung:
 * - erste Zeile = Header
 * - folgende Zeilen = Daten
 */
export async function parseCredosDollarFile(filePath, options = {}) {
  const {
    delimiter = "$",
    encoding = "utf8",
    trimValues = true,
    emptyAsNull = true
  } = options;

  const input = createReadStream(filePath, { encoding });
  const lines = createInterface({
    input,
    crlfDelay: Infinity
  });

  let headers = null;
  let nonEmptyLineNumber = 0;
  const rows = [];

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
    const row = {};

    headers.forEach((header, index) => {
      let value = values[index] ?? "";

      if (trimValues && typeof value === "string") {
        value = value.trim();
      }

      if (emptyAsNull && value === "") {
        value = null;
      }

      row[header] = value;
    });

    row.__meta = {
      sourceFile: filePath,
      lineNumber: nonEmptyLineNumber
    };

    rows.push(row);
  }

  return rows;
}
