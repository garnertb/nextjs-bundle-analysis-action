'use client';

const homeWords = Array.from({ length: 32 }, (_, index) => `home-${index}`);

export default function HomePage() {
  return <main>{homeWords.join(', ')}</main>;
}
