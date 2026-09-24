'use client';

const homeWords = Array.from(
  { length: 32 },
  (_, index) => `home-${index.toString().padStart(2, '0')}`,
);

export function HomeClient() {
  return <p>{homeWords.join(', ')}</p>;
}
