import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formatCredosExportValidationError,
  validateCredosExportFiles
} from "./credosImportMode.mjs";

async function withTempDir(callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "credos-import-mode-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("validates non-empty CREDOS export directory", async () => {
  await withTempDir(async dir => {
    await fs.writeFile(path.join(dir, "export.txt"), "header$line\nvalue$1\n", "utf8");

    const result = await validateCredosExportFiles(dir);

    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
  });
});

test("reports missing CREDOS txt files", async () => {
  await withTempDir(async dir => {
    await fs.writeFile(path.join(dir, "README.md"), "Put CREDOS files here\n", "utf8");

    const result = await validateCredosExportFiles(dir);

    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ["no CREDOS .txt export files found"]);
    assert.match(formatCredosExportValidationError(result), /one or more readable, non-empty CREDOS \.txt export files/);
  });
});

test("rejects empty CREDOS txt files", async () => {
  await withTempDir(async dir => {
    await fs.writeFile(path.join(dir, "empty.txt"), "", "utf8");
    await fs.mkdir(path.join(dir, "directory.txt"));

    const result = await validateCredosExportFiles(dir);

    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, [
      "empty.txt: file is empty"
    ]);
  });
});
