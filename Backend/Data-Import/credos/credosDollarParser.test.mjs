import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseCredosDollarFile } from "./credosDollarParser.mjs";

async function withTempDir(callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "credos-dollar-parser-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("parses CREDOS dollar files with existing trimming and metadata semantics", async () => {
  await withTempDir(async dir => {
    const filePath = path.join(dir, "sample.txt");
    await fs.writeFile(
      filePath,
      "PATID$NAME$EMPTY$MISSING\r\n  1 $ Alice $ $\r\n\r\n2$Bob$value$extra\r\n",
      "utf8"
    );

    const rows = await parseCredosDollarFile(filePath);

    assert.deepEqual(rows, [
      {
        PATID: "1",
        NAME: "Alice",
        EMPTY: null,
        MISSING: null,
        __meta: {
          sourceFile: filePath,
          lineNumber: 2
        }
      },
      {
        PATID: "2",
        NAME: "Bob",
        EMPTY: "value",
        MISSING: "extra",
        __meta: {
          sourceFile: filePath,
          lineNumber: 3
        }
      }
    ]);
  });
});

test("parses large files without using fs.promises.readFile", async () => {
  await withTempDir(async dir => {
    const filePath = path.join(dir, "large.txt");
    const rowsToWrite = 50_000;
    const lines = ["PATID$VALUE"];

    for (let index = 0; index < rowsToWrite; index += 1) {
      lines.push(`${index}$value-${index}`);
    }

    await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");

    const originalReadFile = fs.readFile;
    let readFileCalled = false;
    fs.readFile = async (...args) => {
      readFileCalled = true;
      return await originalReadFile(...args);
    };

    try {
      const rows = await parseCredosDollarFile(filePath);

      assert.equal(readFileCalled, false);
      assert.equal(rows.length, rowsToWrite);
      assert.deepEqual(rows[49_999], {
        PATID: "49999",
        VALUE: "value-49999",
        __meta: {
          sourceFile: filePath,
          lineNumber: 50_001
        }
      });
    } finally {
      fs.readFile = originalReadFile;
    }
  });
});

test("returns an empty array for empty exports", async () => {
  await withTempDir(async dir => {
    const filePath = path.join(dir, "empty.txt");
    await fs.writeFile(filePath, "\n\r\n", "utf8");

    const rows = await parseCredosDollarFile(filePath);

    assert.deepEqual(rows, []);
  });
});
