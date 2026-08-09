import { Buffer } from 'node:buffer';
import { error, type RequestHandler } from '@sveltejs/kit';

const UPSTREAM =
	process.env.GRAPHQL_UPSTREAM_URL ||
	process.env.OVIS_GRAPHQL_UPSTREAM_URL ||
	'http://ovis-backend-apollo:4001/graphql';

const DOCUMENT_TYPES = new Set(['USER_AGREEMENT', 'DATA_ACCESS']);
const LANGUAGES = new Set(['de', 'en']);

export const GET: RequestHandler = async ({ params }) => {
	const type = params.type?.toUpperCase() || '';
	const language = params.language?.toLowerCase() || '';
	if (!DOCUMENT_TYPES.has(type) || !LANGUAGES.has(language)) throw error(404, 'Document not found');

	const response = await fetch(UPSTREAM, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: `query getPlatformDocument($type: PlatformDocumentType!, $language: String!) {
				getPlatformDocument(type: $type, language: $language) {
					filename contentType size dataBase64
				}
			}`,
			variables: { type, language }
		})
	});
	if (!response.ok) throw error(502, 'Platform document service unavailable');

	const result = await response.json();
	const document = result.data?.getPlatformDocument;
	if (!document?.dataBase64) throw error(404, 'Document not found');

	const data = Buffer.from(document.dataBase64, 'base64');
	const filename = String(document.filename || 'platform-document.pdf').replace(/[\r\n"]/g, '');
	const asciiFilename = filename.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_');
	const encodedFilename = encodeURIComponent(filename).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': document.contentType || 'application/pdf',
			'content-length': String(data.length),
			'content-disposition': `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
			'cache-control': 'no-store'
		}
	});
};
