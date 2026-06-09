// credosDollarParser.mjs
import fs from "node:fs/promises";

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

  const content = await fs.readFile(filePath, encoding);

  const lines = content
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== "");

  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0]
    .split(delimiter)
    .map(header => header.trim());

  return lines.slice(1).map((line, lineIndex) => {
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
      lineNumber: lineIndex + 2
    };

    return row;
  });
}