import { open } from 'node:fs/promises';

const CHUNK_CHARACTERS = 64 * 1024;

// Only individual rows are stringified. A collection may exceed V8's string limit.
export function* jsonArrayChunks(rows) {
	let chunk = '[';
	let separator = '';
	for (const row of rows) {
		const json = JSON.stringify(row) ?? 'null';
		if (chunk.length + separator.length + json.length > CHUNK_CHARACTERS) {
			yield chunk;
			chunk = '';
		}
		chunk += separator + json;
		separator = ',\n';
	}
	yield chunk + ']';
}

export async function appendQueryResult({ outTxtPath, omockPath, key, rows, hasExistingEntries }) {
	const outFile = await open(outTxtPath, 'a');
	let omockFile;
	try {
		omockFile = await open(omockPath, 'a');
		const entry = `${JSON.stringify(key)}: `;
		await outFile.writeFile(entry);
		await omockFile.writeFile(`${hasExistingEntries ? ',\n' : ''}${entry}`);
		for (const chunk of jsonArrayChunks(rows)) {
			// Await both writes before generating more JSON, bounding pending output.
			await Promise.all([outFile.writeFile(chunk), omockFile.writeFile(chunk)]);
		}
		await outFile.writeFile(',\n');
	} finally {
		await Promise.all([outFile.close(), omockFile?.close()]);
	}
}
