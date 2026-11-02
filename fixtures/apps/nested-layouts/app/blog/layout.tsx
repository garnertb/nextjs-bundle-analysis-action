'use client';

import type { ReactNode } from 'react';

const blogWords = Array.from({ length: 40 }, (_, index) => `blog-layout-${index}`);

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <nav>{blogWords.join(' ')}</nav>
      {children}
    </section>
  );
}
