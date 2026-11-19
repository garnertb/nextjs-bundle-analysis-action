// Generated from docs/manifests.md "Computed gzip bytes" columns. Do not hand-edit;
// if these drift, re-check docs/manifests.md first.
export const EXPECTED_ROUTE_SIZES: Record<
  string,
  Record<string, [route: string, computedGzip: string][]>
> = {
  '15-webpack': {
    'app-router': [
      ['/', '103.4 kB'],
      ['/_not-found', '104.1 kB'],
      ['/about', '104.9 kB'],
      ['/api/hello', '102.6 kB'],
      ['/blog/[slug]', '104.7 kB'],
    ],
    'pages-router': [
      ['/', '82.9 kB'],
      ['/about', '84.5 kB'],
      ['/blog/[slug]', '84.4 kB'],
    ],
    mixed: [
      ['/legacy', '83.2 kB'],
      ['/legacy/about', '85.2 kB'],
      ['/legacy/blog/[slug]', '84.7 kB'],
      ['/', '103.2 kB'],
      ['/_not-found', '104.1 kB'],
      ['/about', '105.1 kB'],
      ['/api/hello', '102.6 kB'],
      ['/products/[slug]', '104.8 kB'],
    ],
    'nested-layouts': [
      ['/', '103.7 kB'],
      ['/_not-found', '103.5 kB'],
      ['/about', '104.0 kB'],
      ['/blog/[slug]', '105.2 kB'],
      ['/dashboard', '104.0 kB'],
      ['/dashboard/@analytics', '104.3 kB'],
      ['/dashboard/@team', '104.0 kB'],
    ],
  },
  '15-turbopack': {
    'app-router': [
      ['/', '114.4 kB'],
      ['/_not-found', '114.1 kB'],
      ['/about', '115.9 kB'],
      ['/blog/[slug]', '115.7 kB'],
    ],
    'pages-router': [
      ['/', '93.6 kB'],
      ['/about', '95.6 kB'],
      ['/blog/[slug]', '95.4 kB'],
    ],
    mixed: [
      ['/legacy', '93.4 kB'],
      ['/legacy/about', '95.7 kB'],
      ['/legacy/blog/[slug]', '95.2 kB'],
      ['/', '114.1 kB'],
      ['/_not-found', '114.1 kB'],
      ['/about', '116.1 kB'],
      ['/products/[slug]', '115.8 kB'],
    ],
    'nested-layouts': [
      ['/', '114.3 kB'],
      ['/_not-found', '114.1 kB'],
      ['/about', '114.6 kB'],
      ['/blog/[slug]', '115.6 kB'],
      ['/dashboard', '115.4 kB'],
      ['/dashboard/@analytics', '115.4 kB'],
      ['/dashboard/@team', '115.4 kB'],
    ],
  },
  '16-webpack': {
    'app-router': [],
    'pages-router': [
      ['/', '86.8 kB'],
      ['/about', '88.5 kB'],
      ['/blog/[slug]', '88.3 kB'],
    ],
    mixed: [
      ['/legacy', '87.5 kB'],
      ['/legacy/about', '89.4 kB'],
      ['/legacy/blog/[slug]', '89.0 kB'],
    ],
  },
  '16-turbopack': {
    'app-router': [
      ['/', '135.4 kB'],
      ['/_global-error', '134.6 kB'],
      ['/_not-found', '135.2 kB'],
      ['/about', '136.9 kB'],
      ['/api/hello', '0 B'],
      ['/blog/[slug]', '136.7 kB'],
    ],
    'pages-router': [
      ['/', '88.6 kB'],
      ['/about', '90.3 kB'],
      ['/blog/[slug]', '90.2 kB'],
    ],
    mixed: [
      ['/legacy', '88.5 kB'],
      ['/legacy/about', '90.5 kB'],
      ['/legacy/blog/[slug]', '90.0 kB'],
      ['/', '135.1 kB'],
      ['/_global-error', '134.6 kB'],
      ['/_not-found', '135.1 kB'],
      ['/about', '137.1 kB'],
      ['/api/hello', '0 B'],
      ['/products/[slug]', '136.8 kB'],
    ],
  },
};
