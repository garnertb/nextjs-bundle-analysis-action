import type { AppProps } from 'next/app';
import { SharedShell } from '../shared/shared-shell';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SharedShell>
      <Component {...pageProps} />
    </SharedShell>
  );
}
