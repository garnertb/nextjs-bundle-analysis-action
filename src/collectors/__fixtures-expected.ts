// Generated from docs/manifests.md "Computed gzip bytes" columns. Do not hand-edit;
// if these drift, re-check docs/manifests.md first.
export const EXPECTED_ROUTE_SIZES: Record<
  string,
  Record<string, [route: string, computedGzip: string][]>
> = {
  '15-webpack': {
    'app-router': [
      ['/', '102.8 kB'],
      ['/_not-found', '103.5 kB'],
      ['/about', '104.3 kB'],
      ['/api/hello', '102.7 kB'],
      ['/blog/[slug]', '104.2 kB'],
    ],
    'pages-router': [
      ['/', '82.4 kB'],
      ['/about', '84.0 kB'],
      ['/blog/[slug]', '83.9 kB'],
    ],
    mixed: [
      ['/legacy', '82.9 kB'],
      ['/legacy/about', '84.8 kB'],
      ['/legacy/blog/[slug]', '84.4 kB'],
      ['/', '102.7 kB'],
      ['/_not-found', '103.5 kB'],
      ['/about', '104.5 kB'],
      ['/api/hello', '102.7 kB'],
      ['/products/[slug]', '104.3 kB'],
    ],
  },
  '15-turbopack': {
    'app-router': [
      ['/', '114.2 kB'],
      ['/_not-found', '114.0 kB'],
      ['/about', '115.8 kB'],
      ['/blog/[slug]', '115.6 kB'],
    ],
    'pages-router': [
      ['/', '93.5 kB'],
      ['/about', '95.5 kB'],
      ['/blog/[slug]', '95.3 kB'],
    ],
    mixed: [
      ['/legacy', '93.3 kB'],
      ['/legacy/about', '95.6 kB'],
      ['/legacy/blog/[slug]', '95.1 kB'],
      ['/', '114.0 kB'],
      ['/_not-found', '114.0 kB'],
      ['/about', '115.9 kB'],
      ['/products/[slug]', '115.7 kB'],
    ],
  },
  '16-webpack': {
    'app-router': [],
    'pages-router': [
      ['/', '86.5 kB'],
      ['/about', '88.1 kB'],
      ['/blog/[slug]', '88.0 kB'],
    ],
    mixed: [
      ['/legacy', '86.9 kB'],
      ['/legacy/about', '88.8 kB'],
      ['/legacy/blog/[slug]', '88.4 kB'],
    ],
  },
  '16-turbopack': {
    'app-router': [
      ['/', '133.9 kB'],
      ['/_global-error', '133.1 kB'],
      ['/_not-found', '133.6 kB'],
      ['/about', '135.4 kB'],
      ['/api/hello', '0 B'],
      ['/blog/[slug]', '135.2 kB'],
    ],
    'pages-router': [
      ['/', '96.8 kB'],
      ['/about', '98.8 kB'],
      ['/blog/[slug]', '98.6 kB'],
    ],
    mixed: [
      ['/legacy', '96.7 kB'],
      ['/legacy/about', '99.0 kB'],
      ['/legacy/blog/[slug]', '98.5 kB'],
      ['/', '133.6 kB'],
      ['/_global-error', '133.1 kB'],
      ['/_not-found', '133.6 kB'],
      ['/about', '135.6 kB'],
      ['/api/hello', '0 B'],
      ['/products/[slug]', '135.3 kB'],
    ],
  },
};
