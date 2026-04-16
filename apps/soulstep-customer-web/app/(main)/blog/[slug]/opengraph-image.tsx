import { ImageResponse } from 'next/og';
import { fetchBlogPost } from '@/lib/server/api';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Match the cover_gradient categories used in blog posts
const GRADIENTS: Record<string, readonly [string, string]> = {
  Islam: ['#0d3b5c', '#0d7377'],
  Christianity: ['#1a3a5c', '#b08040'],
  Hinduism: ['#6b2200', '#d96e1a'],
  Buddhism: ['#4a2e00', '#c49010'],
  Sikhism: ['#003318', '#c49010'],
  Judaism: ['#1a3050', '#5a8090'],
  'Travel Guide': ['#1a1a40', '#4a2a80'],
  Pilgrimage: ['#2a1a0a', '#8a4a20'],
};

const DEFAULT_GRADIENT: readonly [string, string] = ['#1a1a2e', '#16213e'];

export default async function Image({ params }: { params: { slug: string } }) {
  let title = 'SoulStep Blog';
  let category = 'Spiritual Travel';
  let readingTime = 5;

  try {
    const post = await fetchBlogPost(params.slug);
    title = post.title;
    category = post.category;
    readingTime = post.reading_time;
  } catch {
    // use defaults
  }

  const [from, to] = GRADIENTS[category] ?? DEFAULT_GRADIENT;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '64px',
          background: `linear-gradient(140deg, ${from} 0%, ${to} 100%)`,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle grid overlay for depth */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.04) 0%, transparent 60%)',
          }}
        />
        <div
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.55)',
            textTransform: 'uppercase',
            letterSpacing: '3px',
            marginBottom: '20px',
          }}
        >
          {category}
        </div>
        <div
          style={{
            fontSize: title.length > 55 ? '40px' : '52px',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.15,
            marginBottom: '32px',
            maxWidth: '960px',
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '18px',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
            SoulStep
          </span>
          <span>·</span>
          <span>{readingTime} min read</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
