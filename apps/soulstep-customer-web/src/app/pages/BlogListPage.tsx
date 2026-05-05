'use client';

import { useState, useEffect, useCallback } from 'react';
import { Link } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';
import { getBlogPosts } from '@/lib/api/client';
import type { BlogPostSummary } from '@/lib/types/blog';

const CATEGORIES = [
  'All',
  'Islam',
  'Hinduism',
  'Christianity',
  'Buddhism',
  'Sikhism',
  'Travel Guide',
  'Spirituality',
];

const READING_TIME_FILTERS: { label: string; max: number | null }[] = [
  { label: 'Any length', max: null },
  { label: 'Quick read (≤5 min)', max: 5 },
  { label: 'Medium (≤10 min)', max: 10 },
  { label: 'Long read (>10 min)', max: 9999 },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface animate-pulse">
      <div className="h-44 bg-slate-200 dark:bg-dark-border" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-slate-200 dark:bg-dark-border rounded w-3/4" />
        <div className="h-3 bg-slate-200 dark:bg-dark-border rounded w-full" />
        <div className="h-3 bg-slate-200 dark:bg-dark-border rounded w-2/3" />
      </div>
    </div>
  );
}

export default function BlogListPage() {
  const [allPosts, setAllPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [readingTimeMax, setReadingTimeMax] = useState<number | null>(null);
  const [activeTag, setActiveTag] = useState('');

  useHead({
    title: 'Blog — Spiritual Travel Guides',
    description:
      'Discover in-depth guides to sacred sites, pilgrimage routes, and spiritual travel from around the world.',
    canonicalUrl: 'https://soul-step.org/blog',
    ogType: 'website',
    ogTitle: 'SoulStep Blog — Spiritual Travel Guides',
    ogDescription: `In-depth guides to the world's most significant sacred sites, pilgrimage routes, and spiritual travel destinations.`,
    ogUrl: 'https://soul-step.org/blog',
    twitterCard: 'summary_large_image',
  });

  useEffect(() => {
    getBlogPosts()
      .then(setAllPosts)
      .finally(() => setLoading(false));
  }, []);

  // Collect all unique tags from posts
  const allTags = Array.from(
    new Set(allPosts.flatMap((p) => p.tags ?? []))
  ).sort();

  // Client-side filter (search is also handled server-side for the API but
  // here we filter the cached full list so the UI responds instantly)
  const filtered = allPosts.filter((p) => {
    if (category !== 'All' && p.category !== category) return false;
    if (activeTag && !(p.tags ?? []).some((t) => t.toLowerCase() === activeTag.toLowerCase())) return false;
    if (readingTimeMax !== null) {
      if (readingTimeMax === 9999 && p.reading_time <= 10) return false;
      if (readingTimeMax !== 9999 && p.reading_time > readingTimeMax) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const clearFilters = () => {
    setSearch('');
    setCategory('All');
    setActiveTag('');
    setReadingTimeMax(null);
  };

  const hasActiveFilters = search || category !== 'All' || activeTag || readingTimeMax !== null;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 lg:py-16">
      {/* Page header */}
      <div className="mb-8 lg:mb-10">
        <h1 className="text-3xl lg:text-4xl font-bold text-text-main dark:text-white mb-3">
          Spiritual Travel Guides
        </h1>
        <p className="text-base lg:text-lg text-text-muted dark:text-dark-text-secondary max-w-2xl">
          In-depth guides to the world's most significant sacred sites, pilgrimage routes, and
          traditions of faith — written to help you travel with depth and purpose.
        </p>
      </div>

      {/* Search + filters */}
      <div className="mb-8 space-y-4">
        {/* Search bar */}
        <div className="relative">
          <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-text-muted dark:text-dark-text-secondary text-[20px]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white placeholder-text-muted dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm lg:text-base transition-shadow"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
            >
              <span className="material-icons text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Category filter pills */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === cat
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 dark:bg-dark-surface text-text-muted dark:text-dark-text-secondary hover:bg-primary/10 hover:text-primary border border-transparent dark:border-dark-border'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Reading time + tag filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-muted dark:text-dark-text-secondary">
              Length:
            </span>
            <select
              value={readingTimeMax ?? ''}
              onChange={(e) => setReadingTimeMax(e.target.value === '' ? null : Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {READING_TIME_FILTERS.map((f) => (
                <option key={f.label} value={f.max ?? ''}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {allTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-text-muted dark:text-dark-text-secondary">
                Topic:
              </span>
              {allTags.slice(0, 10).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeTag === tag
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-slate-100 dark:bg-dark-surface text-text-muted dark:text-dark-text-secondary border border-transparent dark:border-dark-border hover:border-primary/20 hover:text-primary'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-semibold text-primary hover:underline ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-text-muted dark:text-dark-text-secondary mb-5">
          {filtered.length === 0
            ? 'No articles found'
            : `${filtered.length} article${filtered.length !== 1 ? 's' : ''}${hasActiveFilters ? ' matching your filters' : ''}`}
        </p>
      )}

      {/* Article grid */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface px-6 py-16 text-center">
          <span className="material-icons text-4xl text-slate-300">article</span>
          <p className="mt-3 text-base font-semibold text-text-main dark:text-white">
            No articles found
          </p>
          <p className="mt-1 text-sm text-text-muted dark:text-dark-text-secondary">
            Try different keywords or remove some filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 text-sm font-semibold text-primary hover:underline"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="group flex flex-col rounded-2xl overflow-hidden border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
            >
              {/* Cover */}
              <div className={`relative h-44 flex-shrink-0 overflow-hidden ${post.cover_image_url ? '' : `bg-gradient-to-br ${post.cover_gradient}`}`}>
                {post.cover_image_url ? (
                  <img
                    src={post.cover_image_url}
                    alt={post.title}
                    className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-3 left-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                    {post.category}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="flex flex-col flex-1 p-5 gap-3">
                <h2 className="text-base font-bold text-text-main dark:text-white leading-snug group-hover:text-primary transition-colors line-clamp-2">
                  {post.title}
                </h2>
                <p className="text-sm text-text-muted dark:text-dark-text-secondary line-clamp-3 flex-1">
                  {post.description}
                </p>

                {/* Tags */}
                {(post.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(post.tags ?? []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dark-border text-text-muted dark:text-dark-text-secondary"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-text-muted dark:text-dark-text-secondary pt-1 border-t border-slate-100 dark:border-dark-border">
                  {post.author_name && <span className="font-medium">{post.author_name}</span>}
                  {post.author_name && <span>·</span>}
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
