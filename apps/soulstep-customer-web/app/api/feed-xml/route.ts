// Proxies the RSS 2.0 feed at soul-step.org/feed.xml

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.soul-step.org';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/feed.xml`, {
      next: { revalidate: 3600 },
    });
    const xml = await res.text();
    return new Response(xml, {
      status: res.status,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new Response('', { status: 503 });
  }
}
