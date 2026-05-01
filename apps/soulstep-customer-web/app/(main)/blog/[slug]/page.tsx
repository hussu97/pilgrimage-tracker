import type { Metadata } from 'next';
import BlogPostPage from '@/app/pages/BlogPostPage';
import { JsonLd } from '@/components/server/JsonLd';
import { fetchBlogPost } from '@/lib/server/api';
import { buildBlogMetadata, buildBlogJsonLd } from '@/lib/server/metadata';
import type { BlogPostDetail } from '@/lib/types/blog';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = await fetchBlogPost(slug);
    return buildBlogMetadata(post);
  } catch {
    return { title: 'Article Not Found' };
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  let schemas: Record<string, unknown>[] = [];
  let post: BlogPostDetail | null = null;
  try {
    post = await fetchBlogPost(slug);
    schemas = buildBlogJsonLd(post);
  } catch {
    // Client component handles the error/404 state
  }
  return (
    <>
      <JsonLd schemas={schemas} />
      <BlogPostPage initialPost={post} />
    </>
  );
}
