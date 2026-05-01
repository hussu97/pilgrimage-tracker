'use client';

import { useState, useEffect } from 'react';
import { useParams, Link } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';
import { getBlogPost, getBlogPosts } from '@/lib/api/client';
import type { BlogPostDetail, BlogPostSummary } from '@/lib/types/blog';
import AdBanner from '@/components/ads/AdBanner';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogPostPage({
  initialPost = null,
}: {
  initialPost?: BlogPostDetail | null;
}) {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostDetail | null>(initialPost);
  const [related, setRelated] = useState<BlogPostSummary[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(!initialPost);

  useEffect(() => {
    if (!slug) return;
    if (initialPost?.slug === slug) {
      setPost(initialPost);
      setLoading(false);
      setNotFound(false);
      getBlogPosts()
        .then((all) => {
          const sameCat = all.filter((a) => a.slug !== slug && a.category === initialPost.category);
          const others = all.filter((a) => a.slug !== slug && a.category !== initialPost.category);
          setRelated([...sameCat, ...others].slice(0, 2));
        })
        .catch(() => {});
      return;
    }

    setLoading(true);
    setNotFound(false);

    getBlogPost(slug)
      .then((p) => {
        setPost(p);
        // Fetch related: same category, exclude current
        getBlogPosts().then((all) => {
          const sameCat = all.filter((a) => a.slug !== slug && a.category === p.category);
          const others = all.filter((a) => a.slug !== slug && a.category !== p.category);
          setRelated([...sameCat, ...others].slice(0, 2));
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, initialPost]);

  useHead(
    post
      ? {
          title: post.title,
          description: post.description,
          canonicalUrl: `https://soul-step.org/blog/${post.slug}`,
          ogType: 'article',
          ogTitle: post.title,
          ogDescription: post.description,
          ogUrl: `https://soul-step.org/blog/${post.slug}`,
          twitterCard: 'summary_large_image',
          twitterTitle: post.title,
          twitterDescription: post.description,
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: post.title,
              description: post.description,
              datePublished: post.published_at,
              dateModified: post.updated_at,
              publisher: {
                '@type': 'Organization',
                name: 'SoulStep',
                url: 'https://soul-step.org',
              },
              mainEntityOfPage: {
                '@type': 'WebPage',
                '@id': `https://soul-step.org/blog/${post.slug}`,
              },
            },
          ],
        }
      : { title: notFound ? 'Article Not Found' : 'Loading…' },
  );

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10 lg:py-16">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-slate-200 dark:bg-dark-border rounded w-24" />
          <div className="h-56 bg-slate-200 dark:bg-dark-border rounded-2xl" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 bg-slate-200 dark:bg-dark-border rounded" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !post) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-text-main dark:text-white mb-4">
          Article not found
        </h1>
        <p className="text-text-muted dark:text-dark-text-secondary mb-8">
          The article you are looking for does not exist or has been moved.
        </p>
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Back to Blog
        </Link>
      </div>
    );
  }

  // Split content: first 2 sections before ad, rest after
  const beforeAd = post.content.slice(0, 2);
  const afterAd = post.content.slice(2);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 lg:py-16">
      {/* Back link */}
      <Link
        to="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted dark:text-dark-text-secondary hover:text-primary transition-colors mb-8"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        All Articles
      </Link>

      {/* Hero */}
      <div className={`rounded-2xl bg-gradient-to-br ${post.cover_gradient} p-8 lg:p-12 mb-8`}>
        <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm mb-4">
          {post.category}
        </span>
        <h1 className="text-2xl lg:text-3xl font-bold text-white leading-snug">{post.title}</h1>
        <div className="flex items-center gap-3 mt-4 text-sm text-white/80">
          <span>{formatDate(post.published_at)}</span>
          <span>·</span>
          <span>{post.reading_time} min read</span>
        </div>
      </div>

      {/* Article body — before mid-article ad */}
      <article className="space-y-6 mb-8">
        {beforeAd.map((section, i) => (
          <div key={i}>
            {section.heading && (
              <h2 className="text-xl lg:text-2xl font-bold text-text-main dark:text-white mt-8 mb-3">
                {section.heading}
              </h2>
            )}
            {section.paragraphs.map((para, j) => (
              <p
                key={j}
                className="text-[15px] lg:text-base text-slate-700 dark:text-slate-300 leading-relaxed mb-4"
              >
                {para}
              </p>
            ))}
          </div>
        ))}
      </article>

      {/* Mid-article ad */}
      <AdBanner slot="place-detail-mid" format="horizontal" className="my-8" />

      {/* Article body — after mid-article ad */}
      <article className="space-y-6 mb-12">
        {afterAd.map((section, i) => (
          <div key={i}>
            {section.heading && (
              <h2 className="text-xl lg:text-2xl font-bold text-text-main dark:text-white mt-8 mb-3">
                {section.heading}
              </h2>
            )}
            {section.paragraphs.map((para, j) => (
              <p
                key={j}
                className="text-[15px] lg:text-base text-slate-700 dark:text-slate-300 leading-relaxed mb-4"
              >
                {para}
              </p>
            ))}
          </div>
        ))}
      </article>

      {/* Bottom ad */}
      <AdBanner slot="place-detail-bottom" format="horizontal" className="mb-12" />

      {/* Related articles */}
      {related.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-text-main dark:text-white mb-5">
            Related Articles
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {related.map((rel) => (
              <Link
                key={rel.slug}
                to={`/blog/${rel.slug}`}
                className="group flex flex-col rounded-2xl overflow-hidden border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface hover:shadow-md transition-shadow duration-200"
              >
                <div className={`h-28 bg-gradient-to-br ${rel.cover_gradient} flex items-end p-3`}>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                    {rel.category}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-bold text-text-main dark:text-white leading-snug group-hover:text-primary transition-colors">
                    {rel.title}
                  </h3>
                  <p className="text-xs text-text-muted dark:text-dark-text-secondary mt-1">
                    {rel.reading_time} min read
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
