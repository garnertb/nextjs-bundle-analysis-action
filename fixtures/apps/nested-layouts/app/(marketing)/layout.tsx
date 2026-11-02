'use client';

import type { ReactNode } from 'react';

const marketingWords = Array.from({ length: 40 }, (_, index) => `marketing-layout-${index}`);

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <header>{marketingWords.join(' ')}</header>
      {children}
    </section>
  );
}
