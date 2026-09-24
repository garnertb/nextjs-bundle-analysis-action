import { BlogClient } from './blog-client';

export default async function BlogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main>
      <h1>Blog: {slug}</h1>
      <BlogClient slug={slug} />
    </main>
  );
}
