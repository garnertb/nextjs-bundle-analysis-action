'use client';

const errorWords = Array.from({ length: 24 }, (_, index) => `blog-error-${index}`);

export default function BlogError({ reset }: { reset: () => void }) {
  return <button onClick={reset}>{errorWords.join(' ')}</button>;
}
