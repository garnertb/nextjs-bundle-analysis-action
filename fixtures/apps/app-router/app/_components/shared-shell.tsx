'use client';

import type { ReactNode } from 'react';
import { sharedTokens } from '../_lib/shared-data';

export function SharedShell({ children }: { children: ReactNode }) {
  return (
    <div data-shared={sharedTokens.slice(0, 5).join(':')}>
      <nav>shared bytes: {sharedTokens.join('').length}</nav>
      {children}
    </div>
  );
}
