import type { GetServerSideProps } from 'next';
import { blogBlob } from '../../shared/blog-data';

type Props = {
  slug: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => ({
  props: { slug: String(context.params?.slug ?? 'missing') },
});

export default function BlogPage({ slug }: Props) {
  return (
    <main>
      <h1>Blog: {slug}</h1>
      <p>blog bytes: {blogBlob.slice(0, 4).join(', ').length}</p>
    </main>
  );
}
