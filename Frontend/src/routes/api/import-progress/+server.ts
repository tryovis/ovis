import { json } from '@sveltejs/kit';

const UPSTREAM =
	process.env.OVIS_CATALOGUE_UPSTREAM_URL ||
	process.env.CATALOGUE_UPSTREAM_URL ||
	'http://ovis-backend-mongodb-data-preprocessing:9000';

export async function GET() {
	try {
		const response = await fetch(`${UPSTREAM}/health`, {
			headers: { accept: 'application/json' }
		});

		const body = await response.text();
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: {
				'content-type': response.headers.get('content-type') || 'application/json',
				'cache-control': 'no-cache, no-store, must-revalidate'
			}
		});
	} catch (error) {
		console.error('Import progress proxy error:', error);
		return json(
			{
				error: 'Progress unavailable',
				message: 'Preprocessing service unreachable'
			},
			{ status: 503 }
		);
	}
}
