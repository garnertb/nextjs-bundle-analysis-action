'use client';

const notFoundWords = Array.from({ length: 24 }, (_, index) => `blog-not-found-${index}`);

export default function BlogNotFound() {
  return <p>{notFoundWords.join(' ')}</p>;
}
