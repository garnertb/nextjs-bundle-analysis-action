import { ProductClient } from './product-client';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main>
      <h1>Product: {slug}</h1>
      <ProductClient slug={slug} />
    </main>
  );
}
