import { describe, it, expect } from 'vitest';
import { articles, getArticleBySlug, getRelatedArticles } from '@/lib/blog/articles';

describe('blog articles', () => {
  it('has exactly 5 articles', () => {
    expect(articles).toHaveLength(5);
  });

  it('every article has required fields', () => {
    for (const article of articles) {
      expect(article.slug, `${article.slug}: missing slug`).toBeTruthy();
      expect(article.title, `${article.slug}: missing title`).toBeTruthy();
      expect(article.description, `${article.slug}: missing description`).toBeTruthy();
      expect(article.publishedAt, `${article.slug}: missing publishedAt`).toBeTruthy();
      expect(article.readingTime, `${article.slug}: missing readingTime`).toBeGreaterThan(0);
      expect(article.category, `${article.slug}: missing category`).toBeTruthy();
      expect(article.content, `${article.slug}: missing content`).toBeDefined();
      expect(article.content.length, `${article.slug}: content is empty`).toBeGreaterThan(0);
    }
  });

  it('all slugs are unique', () => {
    const slugs = articles.map((a) => a.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('publishedAt values are valid ISO date strings', () => {
    for (const article of articles) {
      const d = new Date(article.publishedAt);
      expect(isNaN(d.getTime()), `${article.slug}: invalid publishedAt`).toBe(false);
    }
  });

  it('every article has at least 600 words of content', () => {
    for (const article of articles) {
      const allText = article.content.flatMap((s) => s.paragraphs).join(' ');
      const wordCount = allText.split(/\s+/).filter(Boolean).length;
      expect(wordCount, `${article.slug}: only ${wordCount} words`).toBeGreaterThanOrEqual(600);
    }
  });

  it('every section with a heading has a non-empty heading string', () => {
    for (const article of articles) {
      for (const section of article.content) {
        if (section.heading !== undefined) {
          expect(section.heading.trim().length, `${article.slug}: empty heading`).toBeGreaterThan(
            0,
          );
        }
      }
    }
  });
});

describe('getArticleBySlug', () => {
  it('returns correct article for known slug', () => {
    const article = getArticleBySlug('best-mosques-dubai');
    expect(article).toBeDefined();
    expect(article?.slug).toBe('best-mosques-dubai');
  });

  it('returns undefined for unknown slug', () => {
    expect(getArticleBySlug('does-not-exist')).toBeUndefined();
  });

  it('returns each article by its own slug', () => {
    for (const a of articles) {
      expect(getArticleBySlug(a.slug)?.slug).toBe(a.slug);
    }
  });
});

describe('getRelatedArticles', () => {
  it('returns at most 2 articles by default', () => {
    const article = getArticleBySlug('best-mosques-dubai')!;
    const related = getRelatedArticles(article);
    expect(related.length).toBeLessThanOrEqual(2);
  });

  it('does not include the current article in related', () => {
    for (const article of articles) {
      const related = getRelatedArticles(article);
      expect(related.some((r) => r.slug === article.slug)).toBe(false);
    }
  });

  it('respects count parameter', () => {
    const article = getArticleBySlug('how-to-plan-spiritual-journey')!;
    expect(getRelatedArticles(article, 1)).toHaveLength(1);
    expect(getRelatedArticles(article, 3)).toHaveLength(3);
  });
});
