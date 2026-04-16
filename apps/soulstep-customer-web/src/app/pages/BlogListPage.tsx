'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';
import { getBlogPosts } from '@/lib/api/client';
import type { BlogPostSummary } from '@/lib/types/blog';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useHead({
    title: 'Blog — Spiritual Travel Guides',
    description:
      'Discover in-depth guides to sacred sites, pilgrimage routes, and spiritual travel from around the world. Mosques in Dubai, Hindu temples of South India, Holy Land churches, and more.',
    canonicalUrl: 'https://soul-step.org/blog',
    ogType: 'website',
    ogTitle: 'SoulStep Blog — Spiritual Travel Guides',
    ogDescription: `In-depth guides to the world's most significant sacred sites, pilgrimage routes, and spiritual travel destinations.`,
    ogUrl: 'https://soul-step.org/blog',
    twitterCard: 'summary_large_image',
  });

  useEffect(() => {
    getBlogPosts()
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 lg:py-16">
      {/* Page header */}
      <div className="mb-10 lg:mb-14">
        <h1 className="text-3xl lg:text-4xl font-bold text-text-main dark:text-white mb-3">
          Spiritual Travel Guides
        </h1>
        <p className="text-base lg:text-lg text-text-muted dark:text-dark-text-secondary max-w-2xl">
          In-depth guides to the world's most significant sacred sites, pilgrimage routes, and
          traditions of faith — written to help you travel with depth and purpose.
        </p>
      </div>

      {/* Article grid */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl overflow-hidden border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface animate-pulse"
            >
              <div className="h-44 bg-slate-200 dark:bg-dark-border" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-slate-200 dark:bg-dark-border rounded w-3/4" />
                <div className="h-3 bg-slate-200 dark:bg-dark-border rounded w-full" />
                <div className="h-3 bg-slate-200 dark:bg-dark-border rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="group flex flex-col rounded-2xl overflow-hidden border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm hover:shadow-md transition-shadow duration-200"
            >
              {/* Cover */}
              <div className={`h-44 bg-gradient-to-br ${post.cover_gradient} flex items-end p-4`}>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                  {post.category}
                </span>
              </div>

              {/* Content */}
              <div className="flex flex-col flex-1 p-5 gap-3">
                <h2 className="text-base font-bold text-text-main dark:text-white leading-snug group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                <p className="text-sm text-text-muted dark:text-dark-text-secondary line-clamp-3 flex-1">
                  {post.description}
                </p>
                <div className="flex items-center gap-3 text-xs text-text-muted dark:text-dark-text-secondary pt-1 border-t border-slate-100 dark:border-dark-border">
                  <span>{formatDate(post.published_at)}</span>
                  <span>·</span>
                  <span>{post.reading_time} min read</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
