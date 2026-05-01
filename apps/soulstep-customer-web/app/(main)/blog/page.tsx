import type { Metadata } from 'next';
import BlogListPage from '@/app/pages/BlogListPage';
import { buildBlogListMetadata } from '@/lib/server/metadata';
import { BlogEditorialContent } from '../_components/PublicEditorialContent';

export const metadata: Metadata = buildBlogListMetadata();

export default function Page() {
  return (
    <>
      <BlogListPage />
      <BlogEditorialContent />
    </>
  );
}
