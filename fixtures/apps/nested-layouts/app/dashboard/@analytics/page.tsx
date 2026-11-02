'use client';

const analyticsWords = Array.from({ length: 32 }, (_, index) => `analytics-${index}`);

export default function AnalyticsSlot() {
  return <div>{analyticsWords.join(', ')}</div>;
}
