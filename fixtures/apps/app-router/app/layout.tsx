import type { ReactNode } from 'react';
import { SharedShell } from './_components/shared-shell';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SharedShell>{children}</SharedShell>
      </body>
    </html>
  );
}
