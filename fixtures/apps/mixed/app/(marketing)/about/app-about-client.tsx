'use client';

import { marketingBlob } from '../../../shared/marketing-data';

export function AppAboutClient() {
  return <p>app marketing bytes: {marketingBlob.join('').length}</p>;
}
