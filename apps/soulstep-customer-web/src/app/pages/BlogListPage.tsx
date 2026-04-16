'use client';

import { Link } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';
import { articles } from '@/lib/blog/articles';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogListPage() {
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
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <Link
            key={article.slug}
            to={`/blog/${article.slug}`}
            className="group flex flex-col rounded-2xl overflow-hidden border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm hover:shadow-md transition-shadow duration-200"
          >
            {/* Cover */}
            <div className={`h-44 bg-gradient-to-br ${article.coverGradient} flex items-end p-4`}>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm`}
              >
                {article.category}
              </span>
            </div>

            {/* Content */}
            <div className="flex flex-col flex-1 p-5 gap-3">
              <h2 className="text-base font-bold text-text-main dark:text-white leading-snug group-hover:text-primary transition-colors">
                {article.title}
              </h2>
              <p className="text-sm text-text-muted dark:text-dark-text-secondary line-clamp-3 flex-1">
                {article.description}
              </p>
              <div className="flex items-center gap-3 text-xs text-text-muted dark:text-dark-text-secondary pt-1 border-t border-slate-100 dark:border-dark-border">
                <span>{formatDate(article.publishedAt)}</span>
                <span>·</span>
                <span>{article.readingTime} min read</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
