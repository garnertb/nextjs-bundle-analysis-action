'use client';

const teamWords = Array.from({ length: 32 }, (_, index) => `team-${index}`);

export default function TeamSlot() {
  return <aside>{teamWords.join(', ')}</aside>;
}
