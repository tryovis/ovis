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

test("parses CREDOS dollar files without full-file read buffering", async () => {
	const source = await fs.readFile(
		new URL("./credosDollarParser.mjs", import.meta.url),
		"utf8",
	);

	assert.doesNotMatch(
		source,
		/fs\.readFile\(/,
		"parser must stream input instead of buffering full export files",
	);
});

test("parses non-empty rows and keeps empty values as null", async () => {
	await withTempDir(async (dir) => {
		const filePath = path.join(dir, "export.txt");
		await fs.writeFile(
			filePath,
			"id$name$note\r\n 1 $ Alice $ \r\n\r\n2$Bob$ok\n",
			"utf8",
		);

		const rows = await parseCredosDollarFile(filePath);

		assert.deepEqual(rows, [
			{
				id: "1",
				name: "Alice",
				note: null,
				__meta: {
					sourceFile: filePath,
					lineNumber: 2,
				},
			},
			{
				id: "2",
				name: "Bob",
				note: "ok",
				__meta: {
					sourceFile: filePath,
					lineNumber: 3,
				},
			},
		]);
	});
});

test("returns an empty array for empty exports", async () => {
	await withTempDir(async (dir) => {
		const filePath = path.join(dir, "empty.txt");
		await fs.writeFile(filePath, "\n\r\n", "utf8");

		const rows = await parseCredosDollarFile(filePath);

		assert.deepEqual(rows, []);
	});
});
