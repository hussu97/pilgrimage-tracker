// Proxies chunked backend sitemaps at soul-step.org/sitemaps/*.
// These responses intentionally avoid Next ISR caching because sitemap chunks
// can be several megabytes and Vercel has a strict ISR body-size limit.

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://catalog-api.soul-step.org';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const path = params.path.join('/');

  try {
    const res = await fetch(`${API_BASE}/sitemaps/${path}`, { cache: 'no-store' });
    const xml = await res.text();
    return new Response(xml, {
      status: res.status,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new Response('<?xml version="1.0"?><urlset/>', {
      status: 503,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
