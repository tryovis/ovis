import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const mongoRoot = path.resolve(currentDirectory, '..');
const repositoryRoot = path.resolve(mongoRoot, '../..');

const localImportPattern = /^\s*import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"];?/gm;
const copyPattern = /^\s*COPY\s+(?:(?:--\S+)\s+)*(.+?)\s+(.+?)\s*$/gm;

const normalizeDockerSource = (source) => {
	const trimmed = source.trim();
	if (trimmed.startsWith('[')) return [];
	return trimmed
		.split(/\s+/)
		.filter(Boolean)
		.map((entry) => entry.replace(/^\.\/+/, ''));
};

const isCopiedByPreprocessorImage = (relativeToMongoRoot, copiedSources) =>
	copiedSources.some(
		(source) => relativeToMongoRoot === source || relativeToMongoRoot.startsWith(`${source}/`)
	);

const fileExists = async (filePath) => {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
};

test('preprocessor local imports resolve in the current runtime layout', async () => {
	const preprocessorSource = await readFile(
		path.join(currentDirectory, 'preprocessor.mjs'),
		'utf8'
	);

	const missingImports = (
		await Promise.all(
			[...preprocessorSource.matchAll(localImportPattern)].map(async (match) => {
				const specifier = match[1];
				const absolutePath = path.resolve(currentDirectory, specifier);
				return {
					specifier,
					absolutePath,
					exists: await fileExists(absolutePath)
				};
			})
		)
	).filter(({ exists }) => !exists);

	assert.deepEqual(missingImports, []);
});

test('preprocessor local imports stay inside Docker preprocessor image copy surface', async (t) => {
	const dockerfilePath = path.join(mongoRoot, 'Dockerfile.preprocessor');
	if (!(await fileExists(dockerfilePath))) {
		t.skip('Dockerfile.preprocessor is not copied into the runtime image');
		return;
	}

	const runtimeSourcePaths = [
		path.join(currentDirectory, 'preprocessor.mjs'),
		path.join(mongoRoot, 'createCatalog.mjs')
	];
	const [dockerfileSource, ...runtimeSources] = await Promise.all([
		readFile(dockerfilePath, 'utf8'),
		...runtimeSourcePaths.map((sourcePath) => readFile(sourcePath, 'utf8'))
	]);

	const copiedSources = [...dockerfileSource.matchAll(copyPattern)].flatMap((match) =>
		normalizeDockerSource(match[1])
	);

	const outOfImageImports = runtimeSources
		.flatMap((source, index) =>
			[...source.matchAll(localImportPattern)].map((match) => ({
				specifier: match[1],
				absolutePath: path.resolve(path.dirname(runtimeSourcePaths[index]), match[1])
			}))
		)
		.filter(({ absolutePath }) => absolutePath.startsWith(repositoryRoot))
		.map(({ specifier, absolutePath }) => ({
			specifier,
			relativeToMongoRoot: path.relative(mongoRoot, absolutePath)
		}))
		.filter(
			({ relativeToMongoRoot }) =>
				relativeToMongoRoot.startsWith('..') ||
				!isCopiedByPreprocessorImage(relativeToMongoRoot, copiedSources)
		);

	assert.deepEqual(outOfImageImports, []);
});
