'use client';

const dashboardWords = Array.from({ length: 32 }, (_, index) => `dashboard-${index}`);

export default function DashboardPage() {
  return <main>{dashboardWords.join(', ')}</main>;
}
