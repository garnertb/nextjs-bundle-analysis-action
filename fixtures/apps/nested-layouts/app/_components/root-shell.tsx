'use client';

import type { ReactNode } from 'react';

const shellWords = Array.from({ length: 48 }, (_, index) => `root-shell-${index}`);

export function RootShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav>{shellWords.join(' ')}</nav>
      {children}
    </div>
  );
}
