/** @type {import('@sveltejs/kit').RequestHandler} */
export function GET() {
  return new Response('{}', {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}
