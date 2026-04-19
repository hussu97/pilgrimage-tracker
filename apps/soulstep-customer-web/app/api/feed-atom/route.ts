// Proxies the Atom 1.0 feed at soul-step.org/feed.atom

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://catalog-api.soul-step.org';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/feed.atom`, {
      next: { revalidate: 3600 },
    });
    const xml = await res.text();
    return new Response(xml, {
      status: res.status,
      headers: {
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new Response('', { status: 503 });
  }
}
