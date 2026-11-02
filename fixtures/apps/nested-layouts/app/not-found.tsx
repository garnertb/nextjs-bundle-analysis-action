'use client';

const notFoundWords = Array.from({ length: 24 }, (_, index) => `root-not-found-${index}`);

export default function NotFound() {
  return <main>{notFoundWords.join(' ')}</main>;
}
