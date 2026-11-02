'use client';

import type { ReactNode } from 'react';

const templateWords = Array.from({ length: 24 }, (_, index) => `blog-template-${index}`);

export default function BlogTemplate({ children }: { children: ReactNode }) {
  return <div data-template={templateWords.join(' ')}>{children}</div>;
}
