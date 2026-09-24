'use client';

import { blogBlob } from '../../../shared/blog-data';

export function ProductClient({ slug }: { slug: string }) {
  return (
    <p>
      {slug}: {blogBlob.slice(0, 6).join(' ').length}
    </p>
  );
}
