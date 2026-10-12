import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const backendRequire = createRequire(
	new URL('../../../Backend/Apollo/package.json', import.meta.url)
);
const { buildSchema, buildASTSchema, parse, validate } = backendRequire('graphql');
const { mergeTypeDefs } = backendRequire('@graphql-tools/merge');
const schemaDirectory = new URL('../../../Backend/Apollo/schema/', import.meta.url);
const schema = buildASTSchema(
	mergeTypeDefs(
		fs
			.readdirSync(schemaDirectory)
			.filter((file) => file.endsWith('.graphql'))
			.map((file) => backendRequire(fileURLToPath(new URL(file, schemaDirectory))))
	)
);

async function loadQuery(flag) {
	const result = await build({
		entryPoints: [fileURLToPath(new URL('./gql-tumorboard.ts', import.meta.url))],
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'node',
		plugins: [
			{
				name: 'test-runtime',
				setup(build) {
					build.onResolve({ filter: /^\$env\/dynamic\/public$|^\.\/gql-url$/ }, (args) => ({
						path: args.path,
						namespace: 'test-runtime'
					}));
					build.onLoad({ filter: /.*/, namespace: 'test-runtime' }, ({ path }) => ({
						contents: path.includes('$env')
							? `export const env = ${JSON.stringify({ PUBLIC_WUERZBURG_TB_EXTENSION: flag })};`
							: `export const dataUrl = '/graphql';
						   export const graphqlFetch = async (_url, init) => {
						     globalThis.tumorboardTestRequest = JSON.parse(init.body);
						     return { json: async () => ({ data: { getTumorBoard: [] } }) };
						   };`
					}));
				}
			}
		]
	});
	return import(
		`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
	);
}

for (const [flag, enabled] of [
	[undefined, false],
	['false', false],
	['true', true],
	[' TRUE ', true],
	['1', false]
]) {
	test(`tumorboard query matches the importer flag ${JSON.stringify(flag)}`, async () => {
		const { getTumorboardTable } = await loadQuery(flag);
		await getTumorboardTable(null, 20, '');
		const { query, variables } = globalThis.tumorboardTestRequest;
		const document = parse(query);
		assert.deepEqual(validate(schema, document), []);
		const fields = document.definitions[0].selectionSet.selections[0].selectionSet.selections.map(
			(field) => field.name.value
		);
		assert.equal(fields.length, enabled ? 20 : 10);
		assert.equal(fields.includes('referrer'), enabled);
		assert.equal(fields.includes('molecularCounseling'), enabled);
		assert.deepEqual(variables, { continueFromID: null, limit: 20, filter: '' });
		if (!enabled) {
			// A disabled extension must also work against a backend without the new fields.
			const oldSchema = buildSchema(`
				type Query { getTumorBoard(continueFromID: String, limit: Int, filter: String): [Board] }
				type Board { _id: String patID: String tumorID: String tumorBoardOccurrenceDate: Float
				  tumorBoardDaysSinceDiagnosis: Int type: String presentationMode: String
				  praepost: String tbInternal: String recommendation: String }
			`);
			assert.deepEqual(validate(oldSchema, document), []);
		}
	});
}
