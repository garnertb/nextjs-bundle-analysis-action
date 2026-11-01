'use client';

const loadingWords = Array.from({ length: 24 }, (_, index) => `blog-loading-${index}`);

export default function BlogLoading() {
  return <p>{loadingWords.join(' ')}</p>;
}
