// Proxies the backend sitemap at soul-step.org/sitemap.xml
// This allows Google Search Console to verify the sitemap against the main domain.

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.soul-step.org';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/sitemap.xml`, {
      next: { revalidate: 3600 },
    });
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
