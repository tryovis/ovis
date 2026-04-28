/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  // Configure cache control headers for production
  const response = await resolve(event);
  
  // Prevent caching of API endpoints, especially the catalogue
  if (event.url.pathname.startsWith('/api/catalogue')) {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }
  
  return response;
}