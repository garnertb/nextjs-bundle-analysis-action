import { PostBody } from './post-body';

export function generateStaticParams() {
  return [{ slug: 'hello' }];
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PostBody slug={slug} />;
}
