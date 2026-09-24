'use client';

import type { ReactNode } from 'react';
import { sharedTokens } from './shared-data';

export function SharedShell({ children }: { children: ReactNode }) {
  return (
    <div data-shared={sharedTokens.slice(0, 4).join('-')}>
      <header>shared bytes: {sharedTokens.join('').length}</header>
      {children}
    </div>
  );
}
