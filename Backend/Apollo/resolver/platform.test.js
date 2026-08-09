const assert = require('node:assert/strict');
const test = require('node:test');
const platform = require('./platform');

test('normalizes platform language and color palettes', () => {
	assert.equal(platform.normalizeLanguage('de-DE'), 'de');
	assert.equal(platform.normalizeLanguage('unsupported'), 'en');
	assert.deepEqual(platform.normalizePalette(['#017c40', '#017C40', 'invalid', '#183c64']), [
		'#017c40',
		'#017C40',
		'#183c64'
	]);
});

test('updates only the global default configuration', async () => {
	let configurationOperation;
	const context = {
		collections: {
			platformConfiguration: 'platformConfiguration',
			platformDocument: 'platformDocument'
		},
		db: {
			collection(name) {
				if (name === 'platformConfiguration') {
					return {
						async updateOne(...args) {
							configurationOperation = args;
						}
					};
				}
				return {
					find() {
						return { sort: () => ({ toArray: async () => [] }) };
					}
				};
			}
		}
	};

	const result = await platform.Mutation.updatePlatformConfiguration(
		null,
		{
			input: {
				colorTheme: 'Custom',
				colorPalette: ['#112233', '#445566'],
				systemLanguage: 'de',
				updatedBy: 'admin-1'
			}
		},
		context
	);

	assert.deepEqual(configurationOperation[0], { _id: 'global' });
	assert.equal(configurationOperation[2].upsert, true);
	assert.equal(result.colorTheme, 'Custom');
	assert.equal(result.systemLanguage, 'de');
	assert.equal(result.source, 'DATABASE');
});

test('stores validated PDF documents in a language slot', async () => {
	let documentOperation;
	const context = {
		collections: { platformDocument: 'platformDocument' },
		db: {
			collection() {
				return {
					async updateOne(...args) {
						documentOperation = args;
					}
				};
			}
		}
	};
	const pdf = Buffer.from('%PDF-1.7\nplatform document');

	const result = await platform.Mutation.uploadPlatformDocument(
		null,
		{
			input: {
				type: 'USER_AGREEMENT',
				language: 'de',
				filename: 'nutzungsordnung.pdf',
				contentType: 'application/pdf',
				dataBase64: pdf.toString('base64'),
				updatedBy: 'admin-1'
			}
		},
		context
	);

	assert.deepEqual(documentOperation[0], { _id: 'USER_AGREEMENT:de' });
	assert.equal(documentOperation[2].upsert, true);
	assert.equal(result.filename, 'nutzungsordnung.pdf');
	assert.equal(result.size, pdf.length);
});
