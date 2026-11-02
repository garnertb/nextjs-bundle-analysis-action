'use client';

const globalErrorWords = Array.from({ length: 24 }, (_, index) => `global-error-${index}`);

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <button onClick={reset}>{globalErrorWords.join(' ')}</button>
      </body>
    </html>
  );
}
