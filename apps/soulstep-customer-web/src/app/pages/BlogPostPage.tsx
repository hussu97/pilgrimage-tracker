'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';
import { getBlogPost, getBlogPosts, trackBlogView, trackBlogLinkClick } from '@/lib/api/client';
import type { BlogPostDetail, BlogPostSummary } from '@/lib/types/blog';
import AdBanner from '@/components/ads/AdBanner';

// ── Helpers ────────────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s"'<>()[\]{}]+/g;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function extractUrls(content: BlogPostDetail['content']): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const section of content) {
    for (const para of section.paragraphs ?? []) {
      for (const m of para.matchAll(new RegExp(URL_RE.source, 'g'))) {
        if (!seen.has(m[0])) {
          seen.add(m[0]);
          urls.push(m[0]);
        }
      }
    }
  }
  return urls;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Render a paragraph with clickable URL spans. */
function RichParagraph({
  text,
  onLinkClick,
}: {
  text: string;
  onLinkClick: (url: string) => void;
}) {
  const parts: Array<{ type: 'text' | 'url'; value: string }> = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(URL_RE.source, 'g'))) {
    if (m.index! > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'url', value: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });

  return (
    <p className="text-[15px] lg:text-base text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
      {parts.map((part, i) =>
        part.type === 'url' ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onLinkClick(part.value)}
            className="text-primary underline decoration-primary/40 hover:decoration-primary break-all"
          >
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}

// ── Link preview card ─────────────────────────────────────────────────────────

function LinkCard({ url, slug }: { url: string; slug: string }) {
  const host = hostname(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackBlogLinkClick(slug)}
      className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all group"
    >
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-dark-border flex items-center justify-center flex-shrink-0">
        <img
          src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
          alt=""
          className="w-4 h-4"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-text-muted dark:text-dark-text-secondary uppercase tracking-wide">
          {host}
        </p>
        <p className="text-sm text-text-main dark:text-white truncate group-hover:text-primary transition-colors">
          {url.length > 80 ? url.slice(0, 80) + '…' : url}
        </p>
      </div>
      <span className="material-icons text-[18px] text-text-muted dark:text-dark-text-secondary group-hover:text-primary transition-colors flex-shrink-0">
        open_in_new
      </span>
    </a>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

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
  const viewTrackedRef = useRef<string | null>(null);

  const fetchRelated = useCallback((current: BlogPostDetail) => {
    getBlogPosts()
      .then((all) => {
        const sameCat = all.filter(
          (a) => a.slug !== current.slug && a.category === current.category,
        );
        const others = all.filter(
          (a) => a.slug !== current.slug && a.category !== current.category,
        );
        setRelated([...sameCat, ...others].slice(0, 2));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) return;
    if (initialPost?.slug === slug) {
      setPost(initialPost);
      setLoading(false);
      setNotFound(false);
      fetchRelated(initialPost);
      return;
    }
    setLoading(true);
    setNotFound(false);
    getBlogPost(slug)
      .then((p) => {
        setPost(p);
        fetchRelated(p);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, initialPost, fetchRelated]);

  // Track view once per slug
  useEffect(() => {
    if (post && viewTrackedRef.current !== post.slug) {
      viewTrackedRef.current = post.slug;
      void trackBlogView(post.slug);
    }
  }, [post]);

  const handleLinkClick = useCallback(
    (_url: string) => {
      if (slug) void trackBlogLinkClick(slug);
    },
    [slug],
  );

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

  // Extract unique URLs from all content sections
  const contentUrls = extractUrls(post.content);

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
      <div
        className={`rounded-2xl overflow-hidden mb-8 ${post.cover_image_url ? '' : `bg-gradient-to-br ${post.cover_gradient} p-8 lg:p-12`}`}
      >
        {post.cover_image_url ? (
          <div className="relative">
            <img
              src={post.cover_image_url}
              alt={post.title}
              className="w-full h-56 lg:h-72 object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10">
              <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm mb-3">
                {post.category}
              </span>
              <h1 className="text-2xl lg:text-3xl font-bold text-white leading-snug">
                {post.title}
              </h1>
              <div className="flex items-center gap-3 mt-3 text-sm text-white/80">
                {post.author_name && (
                  <>
                    <span className="font-medium">{post.author_name}</span>
                    <span>·</span>
                  </>
                )}
                <span>{formatDate(post.published_at)}</span>
                <span>·</span>
                <span>{post.reading_time} min read</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm mb-4">
              {post.category}
            </span>
            <h1 className="text-2xl lg:text-3xl font-bold text-white leading-snug">{post.title}</h1>
            <div className="flex items-center gap-3 mt-4 text-sm text-white/80">
              {post.author_name && (
                <>
                  <span className="font-medium">{post.author_name}</span>
                  <span>·</span>
                </>
              )}
              <span>{formatDate(post.published_at)}</span>
              <span>·</span>
              <span>{post.reading_time} min read</span>
            </div>
          </>
        )}
      </div>

      {/* Tags */}
      {(post.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {(post.tags ?? []).map((tag) => (
            <Link
              key={tag}
              to={`/blog?tag=${encodeURIComponent(tag)}`}
              className="text-xs font-medium px-3 py-1 rounded-full bg-slate-100 dark:bg-dark-surface text-text-muted dark:text-dark-text-secondary hover:bg-primary/10 hover:text-primary transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* Article body — before mid-article ad */}
      <article className="space-y-6 mb-8">
        {beforeAd.map((section, i) => (
          <div key={i}>
            {section.heading && (
              <h2 className="text-xl lg:text-2xl font-bold text-text-main dark:text-white mt-8 mb-3">
                {section.heading}
              </h2>
            )}
            {(section.paragraphs ?? []).map((para, j) => (
              <RichParagraph key={j} text={para} onLinkClick={handleLinkClick} />
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
            {(section.paragraphs ?? []).map((para, j) => (
              <RichParagraph key={j} text={para} onLinkClick={handleLinkClick} />
            ))}
          </div>
        ))}
      </article>

      {/* Link previews — shown when URLs exist in content */}
      {contentUrls.length > 0 && (
        <section className="mb-10">
          <h3 className="text-sm font-semibold text-text-muted dark:text-dark-text-secondary uppercase tracking-[0.12em] mb-3 flex items-center gap-2">
            <span className="material-icons text-[16px]">link</span>
            Links in this article
          </h3>
          <div className="space-y-2">
            {contentUrls.map((url) => (
              <LinkCard key={url} url={url} slug={post.slug} />
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      {(post.faq_json ?? []).length > 0 && (
        <section className="mb-12 rounded-2xl border border-slate-100 dark:border-dark-border bg-slate-50 dark:bg-dark-surface p-6">
          <h2 className="text-lg font-bold text-text-main dark:text-white mb-5">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {(post.faq_json ?? []).map((item, i) => (
              <div key={i}>
                <p className="font-semibold text-text-main dark:text-white text-[15px] mb-1">
                  {item.question}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

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
                <div
                  className={`h-28 relative overflow-hidden ${rel.cover_image_url ? '' : `bg-gradient-to-br ${rel.cover_gradient}`}`}
                >
                  {rel.cover_image_url && (
                    <img
                      src={rel.cover_image_url}
                      alt={rel.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-2 left-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                      {rel.category}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-bold text-text-main dark:text-white leading-snug group-hover:text-primary transition-colors line-clamp-2">
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
