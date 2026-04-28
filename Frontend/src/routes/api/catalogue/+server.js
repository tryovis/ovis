import fs from 'fs';
import { json } from '@sveltejs/kit';

function getErrorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

export async function GET() {
	const dynamicPath = '/app/dynamic-catalogue/ovis-catalogue.json';
	// Internal Docker service communication - hardcoded for simplicity
	// Override via OVIS_CATALOGUE_UPSTREAM_URL only for unusual deployments
	const upstreamUrl =
		process.env.OVIS_CATALOGUE_UPSTREAM_URL ||
		'http://ovis-backend-mongodb-data-preprocessing:9000/catalogue';

	const noCacheHeaders = {
		'Cache-Control': 'no-cache, no-store, must-revalidate',
		Pragma: 'no-cache',
		Expires: '0'
	};

	try {
		// Try dynamic catalogue first
		if (fs.existsSync(dynamicPath)) {
			const stats = fs.statSync(dynamicPath);
			const data = fs.readFileSync(dynamicPath, 'utf-8');

			console.log(
				`Serving dynamic catalogue - Size: ${stats.size} bytes, Modified: ${stats.mtime}`
			);

			return json(
				{
					source: 'dynamic',
					timestamp: stats.mtime.getTime(),
					size: stats.size,
					data: JSON.parse(data)
				},
				{
					headers: {
						...noCacheHeaders,
						ETag: `"${stats.mtime.getTime()}-${stats.size}"`
					}
				}
			);
		}
	} catch (error) {
		console.log('Dynamic catalogue not available, trying upstream:', getErrorMessage(error));
	}

	// Try upstream (preprocessing service) before static fallback
	try {
		if (upstreamUrl) {
			const res = await fetch(upstreamUrl, { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(`Upstream returned ${res.status} ${res.statusText}`);

			const bodyText = await res.text();
			const size = Buffer.byteLength(bodyText, 'utf-8');
			const parsed = JSON.parse(bodyText);

			// If upstream already returns the same wrapper shape, forward it.
			if (parsed && typeof parsed === 'object' && parsed.data && parsed.timestamp) {
				return json(
					{ ...parsed, source: parsed.source ?? 'upstream' },
					{
						headers: {
							...noCacheHeaders,
							...(parsed.timestamp && parsed.size
								? { ETag: `"${parsed.timestamp}-${parsed.size}"` }
								: {})
						}
					}
				);
			}

			// Otherwise, treat upstream response as raw catalogue JSON array/object.
			const lastModified = res.headers.get('last-modified');
			const timestamp = lastModified ? new Date(lastModified).getTime() : Date.now();

			console.log(
				`Serving upstream catalogue from ${upstreamUrl} - Size: ${size} bytes, Modified: ${new Date(
					timestamp
				).toISOString()}`
			);

			return json(
				{
					source: 'upstream',
					timestamp,
					size,
					data: parsed
				},
				{
					headers: {
						...noCacheHeaders,
						ETag: `"${timestamp}-${size}"`
					}
				}
			);
		}
	} catch (error) {
		console.error('Upstream catalogue not available:', getErrorMessage(error));
		return json(
			{
				error: 'Catalogue not available',
				message: 'Upstream preprocessing service unreachable'
			},
			{
				status: 503,
				headers: {
					...noCacheHeaders
				}
			}
		);
	}
}
