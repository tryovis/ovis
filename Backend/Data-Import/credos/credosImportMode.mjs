import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultCredosExportDir = path.join(__dirname, "CREDOSExportFiles");

export async function validateCredosExportFiles(exportDir = defaultCredosExportDir) {
  const failures = [];
  let entries;

  try {
    entries = await fs.readdir(exportDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      failures.push("export directory is missing");
    } else {
      failures.push(`export directory cannot be read: ${error.message}`);
    }

    return {
      exportDir,
      ok: false,
      failures
    };
  }

  const txtFiles = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"));

  if (txtFiles.length === 0) {
    failures.push("no CREDOS .txt export files found");
  }

  for (const entry of txtFiles) {
    const filePath = path.join(exportDir, entry.name);
    const stats = await fs.stat(filePath);

    try {
      await fs.access(filePath, fsConstants.R_OK);
    } catch {
      failures.push(`${entry.name}: file is not readable`);
      continue;
    }

    if (stats.size === 0) {
      failures.push(`${entry.name}: file is empty`);
    }
  }

  return {
    exportDir,
    ok: failures.length === 0,
    failures
  };
}

export function formatCredosExportValidationError(result) {
  return [
    "CREDOS export files are missing or invalid.",
    `Expected one or more readable, non-empty CREDOS .txt export files in: ${result.exportDir}`,
    "Put the Credos export files there, or mount an external omock.json at /input/omock.json to skip Credos generation.",
    "Problems:",
    ...result.failures.map(failure => `- ${failure}`)
  ].join("\n");
}

if (process.argv[1] === __filename && process.argv[2] === "validate") {
  const exportDir = process.argv[3] || process.env.CREDOS_EXPORT_DIR || defaultCredosExportDir;
  const result = await validateCredosExportFiles(exportDir);

  if (!result.ok) {
    console.error(formatCredosExportValidationError(result));
    process.exit(1);
  }

  console.log(`CREDOS export files validated: ${exportDir}`);
}
