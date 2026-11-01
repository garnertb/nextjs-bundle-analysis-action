'use client';

const aboutWords = Array.from({ length: 32 }, (_, index) => `about-${index}`);

export default function AboutPage() {
  return <main>{aboutWords.join(', ')}</main>;
}
