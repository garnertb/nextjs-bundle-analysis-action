import type { GetServerSideProps } from 'next';
import { blogBlob } from '../../../shared/blog-data';

type Props = {
  slug: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => ({
  props: { slug: String(context.params?.slug ?? 'missing') },
});

export default function LegacyBlogPage({ slug }: Props) {
  return (
    <p>
      {slug}: {blogBlob.slice(0, 5).join(' | ').length}
    </p>
  );
}
