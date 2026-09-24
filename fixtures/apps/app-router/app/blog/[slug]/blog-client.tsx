'use client';

import { blogBlob } from '../../_lib/blog-data';

export function BlogClient({ slug }: { slug: string }) {
  return (
    <p>
      {slug}: {blogBlob.slice(0, 4).join(', ').length}
    </p>
  );
}
