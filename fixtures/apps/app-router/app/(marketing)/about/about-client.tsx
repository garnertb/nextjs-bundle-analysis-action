'use client';

import { marketingBlob } from '../../_lib/marketing-data';

export function AboutClient() {
  const preview = marketingBlob.slice(0, 3).join(' | ');
  return <p data-preview={preview}>marketing bytes: {marketingBlob.join('').length}</p>;
}
