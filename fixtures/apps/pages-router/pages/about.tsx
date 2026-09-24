import { marketingBlob } from '../shared/marketing-data';

export default function AboutPage() {
  return (
    <main>
      <h1>About</h1>
      <p>marketing bytes: {marketingBlob.join('').length}</p>
    </main>
  );
}
