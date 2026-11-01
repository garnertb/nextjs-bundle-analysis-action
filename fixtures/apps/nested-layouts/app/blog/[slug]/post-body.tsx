'use client';

const postWords = Array.from({ length: 32 }, (_, index) => `post-${index}`);

export function PostBody({ slug }: { slug: string }) {
  return (
    <main>
      <h1>{slug}</h1>
      {postWords.join(', ')}
    </main>
  );
}
