import fs from 'node:fs';
import { json } from '@sveltejs/kit';
import { getBackendSession } from '$lib/server/backend-auth';
import { protectCatalogue, catalogueRevision } from '$lib/server/catalogue-access';

function getErrorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

export async function GET({ request }) {
	const session = await getBackendSession(request);
	if (session instanceof Response) return session;
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
			const revision = catalogueRevision(stats.mtime.getTime(), session);

			console.log(
				`Serving dynamic catalogue - Size: ${stats.size} bytes, Modified: ${stats.mtime}`
			);

			return json(
				{
					source: 'dynamic',
					timestamp: stats.mtime.getTime(),
					revision,
					size: stats.size,
					data: protectCatalogue(JSON.parse(data), session)
				},
				{
					headers: {
						...noCacheHeaders,
						ETag: `"${revision}-${stats.size}"`
					}
				}
			);
		}
	} catch (error) {
		console.log('Dynamic catalogue not available, trying upstream:', getErrorMessage(error));
	}

	try {
		if (upstreamUrl) {
			const res = await fetch(upstreamUrl, { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(`Upstream returned ${res.status} ${res.statusText}`);

			const bodyText = await res.text();
			const size = Buffer.byteLength(bodyText, 'utf-8');
			const parsed = JSON.parse(bodyText);

			// If upstream already returns the same wrapper shape, forward it.
			if (parsed && typeof parsed === 'object' && parsed.data && parsed.timestamp) {
				const revision = catalogueRevision(parsed.timestamp, session);
				return json(
					{ ...parsed, revision, data: protectCatalogue(parsed.data, session), source: parsed.source ?? 'upstream' },
					{
						headers: {
							...noCacheHeaders,
							...(parsed.timestamp && parsed.size
								? { ETag: `"${revision}-${parsed.size}"` }
								: {})
						}
					}
				);
			}

			// Otherwise, treat upstream response as raw catalogue JSON array/object.
			const lastModified = res.headers.get('last-modified');
			const timestamp = lastModified ? new Date(lastModified).getTime() : Date.now();
			const revision = catalogueRevision(timestamp, session);

			console.log(
				`Serving upstream catalogue from ${upstreamUrl} - Size: ${size} bytes, Modified: ${new Date(
					timestamp
				).toISOString()}`
			);

			return json(
				{
					source: 'upstream',
					timestamp,
					revision,
					size,
					data: protectCatalogue(parsed, session)
				},
				{
					headers: {
						...noCacheHeaders,
						ETag: `"${revision}-${size}"`
					}
				}
			);
		}
	} catch (error) {
		console.warn('Catalogue pending while preprocessing/import completes:', getErrorMessage(error));
		return json(
			{
				status: 'processing',
				severity: 'warning',
				message:
					'Data import or preprocessing is still in progress. Catalogue data will appear automatically once it is ready.',
				upstreamAvailable: false
			},
			{
				status: 202,
				headers: {
					...noCacheHeaders
				}
			}
		);
	}
}
