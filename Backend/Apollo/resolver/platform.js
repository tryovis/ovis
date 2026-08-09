const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(['USER_AGREEMENT', 'DATA_ACCESS']);
const LANGUAGES = new Set(['de', 'en']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const cleanText = (value, maxLength = 120) =>
	typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const normalizeLanguage = (value) => {
	const language = cleanText(value, 5).toLowerCase().split('-')[0];
	return LANGUAGES.has(language) ? language : 'en';
};

const normalizePalette = (value) => {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(value.map((color) => cleanText(color, 7)).filter((color) => HEX_COLOR.test(color)))
	].slice(0, 30);
};

const platformDefaults = () => ({
	colorTheme: cleanText(process.env.PUBLIC_SYSTEM_COLOR_THEME, 80) || 'CCCMunich',
	colorPalette: [],
	systemLanguage: normalizeLanguage(process.env.PUBLIC_SYSTEM_START_LANGUAGE),
	source: 'ENVIRONMENT',
	updatedAt: null,
	updatedBy: null
});

const documentId = (type, language) => `${type}:${normalizeLanguage(language)}`;

const documentInfo = (document) => ({
	type: document.type,
	language: document.language,
	filename: document.filename,
	contentType: document.contentType,
	size: document.size,
	updatedAt: document.updatedAt,
	updatedBy: document.updatedBy || null
});

const documentBuffer = (value) => {
	if (Buffer.isBuffer(value)) return value;
	if (value?.buffer) return Buffer.from(value.buffer);
	if (typeof value?.value === 'function') return Buffer.from(value.value());
	return Buffer.alloc(0);
};

const listDocuments = async (context) => {
	const documents = await context.db
		.collection(context.collections.platformDocument)
		.find({}, { projection: { data: 0 } })
		.sort({ type: 1, language: 1 })
		.toArray();
	return documents.map(documentInfo);
};

const configurationResult = async (context, configuration) => ({
	...platformDefaults(),
	...(configuration || {}),
	source: configuration ? 'DATABASE' : 'ENVIRONMENT',
	documents: await listDocuments(context)
});

const resolvers = {
	Query: {
		getPlatformConfiguration: async (_parent, _input, context) => {
			const configuration = await context.db
				.collection(context.collections.platformConfiguration)
				.findOne({ _id: 'global' });
			return configurationResult(context, configuration);
		},

		getPlatformDocument: async (_parent, { type, language }, context) => {
			if (!DOCUMENT_TYPES.has(type)) return null;
			const normalizedLanguage = normalizeLanguage(language);
			const document = await context.db
				.collection(context.collections.platformDocument)
				.findOne({ _id: documentId(type, normalizedLanguage) });
			if (!document) return null;

			return {
				...documentInfo(document),
				dataBase64: documentBuffer(document.data).toString('base64')
			};
		}
	},

	Mutation: {
		updatePlatformConfiguration: async (_parent, { input }, context) => {
			const colorTheme = cleanText(input.colorTheme, 80);
			const colorPalette = normalizePalette(input.colorPalette);
			const systemLanguage = normalizeLanguage(input.systemLanguage);
			if (!colorTheme) throw new Error('A platform color theme name is required.');
			if (colorPalette.length < 2)
				throw new Error('A platform color theme requires at least two colors.');

			const configuration = {
				colorTheme,
				colorPalette,
				systemLanguage,
				updatedAt: Date.now(),
				updatedBy: cleanText(input.updatedBy, 160) || null
			};

			await context.db
				.collection(context.collections.platformConfiguration)
				.updateOne({ _id: 'global' }, { $set: configuration }, { upsert: true });

			return configurationResult(context, configuration);
		},

		uploadPlatformDocument: async (_parent, { input }, context) => {
			if (!DOCUMENT_TYPES.has(input.type)) throw new Error('Unsupported platform document type.');
			const language = normalizeLanguage(input.language);
			const filename = cleanText(input.filename, 180);
			if (!filename.toLowerCase().endsWith('.pdf'))
				throw new Error('Platform documents must be PDF files.');
			if (input.contentType !== 'application/pdf')
				throw new Error('Platform documents must use application/pdf.');

			const data = Buffer.from(input.dataBase64 || '', 'base64');
			if (data.length === 0 || data.subarray(0, 5).toString() !== '%PDF-') {
				throw new Error('The uploaded file is not a valid PDF document.');
			}
			if (data.length > MAX_DOCUMENT_BYTES) {
				throw new Error('Platform documents may not exceed 8 MB.');
			}

			const document = {
				type: input.type,
				language,
				filename,
				contentType: 'application/pdf',
				size: data.length,
				data,
				updatedAt: Date.now(),
				updatedBy: cleanText(input.updatedBy, 160) || null
			};

			await context.db
				.collection(context.collections.platformDocument)
				.updateOne(
					{ _id: documentId(document.type, document.language) },
					{ $set: document },
					{ upsert: true }
				);

			return documentInfo(document);
		}
	}
};

Object.defineProperties(resolvers, {
	MAX_DOCUMENT_BYTES: { value: MAX_DOCUMENT_BYTES },
	documentBuffer: { value: documentBuffer },
	normalizeLanguage: { value: normalizeLanguage },
	normalizePalette: { value: normalizePalette },
	platformDefaults: { value: platformDefaults }
});

module.exports = resolvers;
