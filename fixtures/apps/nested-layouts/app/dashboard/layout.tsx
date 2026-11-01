'use client';

import type { ReactNode } from 'react';

const dashboardWords = Array.from({ length: 40 }, (_, index) => `dashboard-layout-${index}`);

export default function DashboardLayout({
  children,
  team,
  analytics,
}: {
  children: ReactNode;
  team: ReactNode;
  analytics: ReactNode;
}) {
  return (
    <section>
      <nav>{dashboardWords.join(' ')}</nav>
      {children}
      {team}
      {analytics}
    </section>
  );
}
