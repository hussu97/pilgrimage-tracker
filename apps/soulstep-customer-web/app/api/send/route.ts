import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const UMAMI_ENDPOINT = 'https://cloud.umami.is/api/send';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? '';
    const userAgent = request.headers.get('user-agent') ?? '';

    await fetch(UMAMI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Analytics must never affect the user-facing request.
  }

  return new NextResponse(null, { status: 204 });
}
