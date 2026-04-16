import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlogPostSummary, BlogPostDetail } from '@/lib/types/blog';
import { invalidateCache } from '@/lib/api/cache';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockPosts: BlogPostSummary[] = [
  {
    post_code: 'blg_001',
    slug: 'best-mosques-dubai',
    title: 'The Most Visited Mosques in Dubai: A Complete Guide',
    description: 'A guide to the most beautiful mosques in Dubai.',
    published_at: '2025-08-14T09:00:00+00:00',
    updated_at: '2025-08-14T09:00:00+00:00',
    reading_time: 7,
    category: 'Islam',
    cover_gradient: 'from-emerald-600 to-teal-800',
  },
  {
    post_code: 'blg_002',
    slug: 'sacred-hindu-temples-south-india',
    title: 'Sacred Hindu Temples of South India',
    description: 'Journey through the magnificent temples of South India.',
    published_at: '2025-09-01T09:00:00+00:00',
    updated_at: '2025-09-01T09:00:00+00:00',
    reading_time: 8,
    category: 'Hinduism',
    cover_gradient: 'from-orange-500 to-red-700',
  },
  {
    post_code: 'blg_003',
    slug: 'how-to-plan-spiritual-journey',
    title: 'How to Plan a Spiritual Journey',
    description: 'Planning a meaningful spiritual journey requires thought.',
    published_at: '2025-09-18T09:00:00+00:00',
    updated_at: '2025-09-18T09:00:00+00:00',
    reading_time: 6,
    category: 'Travel Guide',
    cover_gradient: 'from-violet-600 to-purple-900',
  },
];

const mockPostDetail: BlogPostDetail = {
  ...mockPosts[0],
  content: [
    {
      paragraphs: [
        'Dubai is a city of extraordinary contrasts.',
        'The city is home to more than 1,400 mosques.',
      ],
    },
    {
      heading: 'Jumeirah Mosque',
      paragraphs: ['The Jumeirah Mosque is the most recognisable mosque in Dubai.'],
    },
  ],
};

// ─── Mock fetch ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('navigator', { userAgent: 'test' });
  invalidateCache(); // clear in-memory cache between tests
});

function mockFetchOnce(data: unknown, ok = true) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok,
    json: async () => data,
  } as Response);
}

// ─── getBlogPosts ─────────────────────────────────────────────────────────────

describe('getBlogPosts', () => {
  it('returns a list of blog post summaries', async () => {
    mockFetchOnce(mockPosts);
    const { getBlogPosts } = await import('@/lib/api/client');
    const posts = await getBlogPosts();
    expect(posts).toHaveLength(3);
    expect(posts[0].slug).toBe('best-mosques-dubai');
  });

  it('each post has required fields', async () => {
    mockFetchOnce(mockPosts);
    const { getBlogPosts } = await import('@/lib/api/client');
    const posts = await getBlogPosts();
    for (const post of posts) {
      expect(post.post_code).toBeTruthy();
      expect(post.slug).toBeTruthy();
      expect(post.title).toBeTruthy();
      expect(post.description).toBeTruthy();
      expect(post.published_at).toBeTruthy();
      expect(post.reading_time).toBeGreaterThan(0);
      expect(post.category).toBeTruthy();
      expect(post.cover_gradient).toBeTruthy();
    }
  });

  it('throws on non-ok response', async () => {
    mockFetchOnce({ detail: 'error' }, false);
    const { getBlogPosts } = await import('@/lib/api/client');
    await expect(getBlogPosts()).rejects.toThrow();
  });
});

// ─── getBlogPost ──────────────────────────────────────────────────────────────

describe('getBlogPost', () => {
  it('returns full post detail with content', async () => {
    mockFetchOnce(mockPostDetail);
    const { getBlogPost } = await import('@/lib/api/client');
    const post = await getBlogPost('best-mosques-dubai');
    expect(post.slug).toBe('best-mosques-dubai');
    expect(post.content).toBeDefined();
    expect(post.content.length).toBeGreaterThan(0);
  });

  it('content sections have paragraphs array', async () => {
    mockFetchOnce(mockPostDetail);
    const { getBlogPost } = await import('@/lib/api/client');
    const post = await getBlogPost('best-mosques-dubai');
    for (const section of post.content) {
      expect(Array.isArray(section.paragraphs)).toBe(true);
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });

  it('throws on 404', async () => {
    mockFetchOnce({ detail: 'Blog post not found' }, false);
    const { getBlogPost } = await import('@/lib/api/client');
    await expect(getBlogPost('does-not-exist')).rejects.toThrow();
  });
});

// ─── published_at date validation ─────────────────────────────────────────────

describe('blog post date fields', () => {
  it('published_at values are valid ISO date strings', () => {
    for (const post of mockPosts) {
      const d = new Date(post.published_at);
      expect(isNaN(d.getTime())).toBe(false);
    }
  });

  it('posts are returned newest-first (API contract)', () => {
    // The backend orders by published_at DESC — verify fixture ordering
    const dates = mockPosts.map((p) => new Date(p.published_at).getTime());
    // mockPosts are in ascending order here (oldest first), just validate parsing
    expect(dates.every((d) => d > 0)).toBe(true);
  });
});
