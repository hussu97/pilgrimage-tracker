import BlogPostPage from '@/app/pages/BlogPostPage';
import { articles } from '@/lib/blog/articles';

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export default function Page() {
  return <BlogPostPage />;
}
