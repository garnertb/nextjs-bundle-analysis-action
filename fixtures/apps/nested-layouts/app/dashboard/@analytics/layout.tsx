'use client';

import type { ReactNode } from 'react';

const analyticsWords = Array.from({ length: 40 }, (_, index) => `analytics-layout-${index}`);

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <aside>
      <header>{analyticsWords.join(' ')}</header>
      {children}
    </aside>
  );
}
