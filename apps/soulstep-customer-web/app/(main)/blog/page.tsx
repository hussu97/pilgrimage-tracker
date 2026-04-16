import type { Metadata } from 'next';
import BlogListPage from '@/app/pages/BlogListPage';
import { buildBlogListMetadata } from '@/lib/server/metadata';

export const metadata: Metadata = buildBlogListMetadata();

export default function Page() {
  return <BlogListPage />;
}
