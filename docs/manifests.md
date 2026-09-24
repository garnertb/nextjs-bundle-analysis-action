# Next.js manifest research

All installs/builds ran outside the repo in `$HOME/.copilot-nextjs-bundle-analysis-action-scratch`. The committed fixtures under `fixtures/next/**` are trimmed copies that keep the manifest evidence plus referenced client JS chunks only.

## Normalization rules used in this research

- App Router manifest keys were normalized exactly like the existing reference implementation: strip the trailing `/page` or `/route`, drop route-group segments like `(marketing)`, and keep intercepting-route markers and parallel-route markers unchanged.
- File sets were deduplicated before sizing (`Set` semantics).
- Gzip sizes were computed from the actual emitted files under `.next/` with Node `zlib.gzipSync`.
- If a combo had no reliable manifest-based route -> client-chunk mapping, I marked it **UNSUPPORTED** instead of guessing.

## Final support matrix

| Combo        | App Router                                                                                                                                          | Pages Router                            | Mixed app                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 14-webpack   | SUPPORTED — `app-build-manifest.json.pages`                                                                                                         | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — split by `build-manifest.json.pages` and `app-build-manifest.json.pages`               |
| 15-webpack   | SUPPORTED — `app-build-manifest.json.pages`                                                                                                         | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — split by `build-manifest.json.pages` and `app-build-manifest.json.pages`               |
| 15-turbopack | SUPPORTED — `app-build-manifest.json.pages`                                                                                                         | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — split by `build-manifest.json.pages` and `app-build-manifest.json.pages`               |
| 16-webpack   | UNSUPPORTED — no reliable App Router route->chunks manifest; `*_client-reference-manifest.js` lacks `entryJSFiles` and over-includes sibling chunks | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — Pages Router half via `build-manifest.json.pages`; App Router half remains unsupported |
| 16-turbopack | SUPPORTED — `build-manifest.json.rootMainFiles` + `server/app/**/_client-reference-manifest.js` `entryJSFiles`                                      | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — pages via `build-manifest.json.pages`, app via `rootMainFiles ∪ entryJSFiles`          |

## 14-webpack

### app-router

- Version: `Next.js v14.2.35`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` has exact App Router route-to-chunk arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build, so there is no client-JS entry to count.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/chunks/font-manifest.json`
- `server/font-manifest.json`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/server-reference-manifest.json`
- `static/RJl0dMUTl1_y--gcXay3g/_buildManifest.js`
- `static/RJl0dMUTl1_y--gcXay3g/_ssgManifest.js`
- `static/chunks/2200cc46-8888eb43b3e410d8.js`
- `static/chunks/945-67e69556dfc1e382.js`
- `static/chunks/framework-6e06c675866dc992.js`
- `static/chunks/main-0e6531f0e2deee1e.js`
- `static/chunks/main-app-c60fdb6e7fc9a703.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-100b9e646d9c912e.js`
- `types/package.json`

</details>

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/_not-found/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/2200cc46-8888eb43b3e410d8.js",
      "static/chunks/945-67e69556dfc1e382.js",
      "static/chunks/main-app-c60fdb6e7fc9a703.js",
      "static/chunks/app/_not-found/page-43f6d17315d88b4e.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/2200cc46-8888eb43b3e410d8.js",
      "static/chunks/945-67e69556dfc1e382.js",
      "static/chunks/main-app-c60fdb6e7fc9a703.js",
      "static/chunks/app/blog/[slug]/page-f7f9cf87177bf643.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/2200cc46-8888eb43b3e410d8.js",
      "static/chunks/945-67e69556dfc1e382.js",
      "static/chunks/main-app-c60fdb6e7fc9a703.js",
      "static/chunks/app/(marketing)/about/page-7855248e24509974.js"
    ],
    "/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/2200cc46-8888eb43b3e410d8.js",
      "static/chunks/945-67e69556dfc1e382.js",
      "static/chunks/main-app-c60fdb6e7fc9a703.js",
      "static/chunks/app/page-93a32ac19bd49101.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key              | Gzip total | `next build` First Load JS | Note     |
| -------------- | ------ | ------------------------- | ---------: | -------------------------: | -------- |
| `/`            | app    | `/page`                   |    87.7 kB |                    87.5 kB | Δ +195 B |
| `/_not-found`  | app    | `/_not-found/page`        |    88.3 kB |                    88.1 kB | Δ +159 B |
| `/about`       | app    | `/(marketing)/about/page` |    89.4 kB |                    89.0 kB | Δ +381 B |
| `/blog/[slug]` | app    | `/blog/[slug]/page`       |    89.1 kB |                    88.8 kB | Δ +338 B |

### pages-router

- Version: `Next.js v14.2.35`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `build-manifest.json.pages` has exact Pages Router route-to-chunk arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `build-manifest.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/chunks/font-manifest.json`
- `server/font-manifest.json`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/about.js.nft.json`
- `server/pages/index.js.nft.json`
- `static/Dbt3ASbwwWPE2n5nXyJWO/_buildManifest.js`
- `static/Dbt3ASbwwWPE2n5nXyJWO/_ssgManifest.js`
- `static/chunks/framework-0cbe3b56a5f66701.js`
- `static/chunks/main-ad05dcf28e33934b.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-4e7214a60fad8e88.js`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/webpack-4e7214a60fad8e88.js",
      "static/chunks/framework-0cbe3b56a5f66701.js",
      "static/chunks/main-ad05dcf28e33934b.js",
      "static/chunks/pages/index-51509603c9147aac.js"
    ],
    "/about": [
      "static/chunks/webpack-4e7214a60fad8e88.js",
      "static/chunks/framework-0cbe3b56a5f66701.js",
      "static/chunks/main-ad05dcf28e33934b.js",
      "static/chunks/pages/about-4ccc96ffae48f374.js"
    ],
    "/blog/[slug]": [
      "static/chunks/webpack-4e7214a60fad8e88.js",
      "static/chunks/framework-0cbe3b56a5f66701.js",
      "static/chunks/main-ad05dcf28e33934b.js",
      "static/chunks/pages/blog/[slug]-cdd73557c2224fdf.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note     |
| -------------- | ------ | -------------- | ---------: | -------------------------: | -------- |
| `/`            | pages  | `/`            |    80.1 kB |                    80.6 kB | Δ -536 B |
| `/about`       | pages  | `/about`       |    81.7 kB |                    82.2 kB | Δ -490 B |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    81.6 kB |                    82.1 kB | Δ -499 B |

### mixed

- Version: `Next.js v14.2.35`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`.
- Shared/root representation: Pages and App Router each repeat their own shared chunks inside per-route arrays. Do not merge the routers: compute intersections separately.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/chunks/font-manifest.json`
- `server/font-manifest.json`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/legacy.js.nft.json`
- `server/server-reference-manifest.json`
- `static/IMoHJzc_qBeYh-CnsJg8L/_buildManifest.js`
- `static/IMoHJzc_qBeYh-CnsJg8L/_ssgManifest.js`
- `static/chunks/2200cc46-8888eb43b3e410d8.js`
- `static/chunks/945-25bcc0729128f665.js`
- `static/chunks/framework-5e252d5045bb7a0e.js`
- `static/chunks/main-9293133c2a1713ef.js`
- `static/chunks/main-app-2af625d88cf03887.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-100b9e646d9c912e.js`
- `types/package.json`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/legacy": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/framework-5e252d5045bb7a0e.js",
      "static/chunks/main-9293133c2a1713ef.js",
      "static/chunks/pages/legacy-746a34255e3719b5.js"
    ],
    "/legacy/about": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/framework-5e252d5045bb7a0e.js",
      "static/chunks/main-9293133c2a1713ef.js",
      "static/chunks/pages/legacy/about-b8fbee5ecf3ab2e5.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/framework-5e252d5045bb7a0e.js",
      "static/chunks/main-9293133c2a1713ef.js",
      "static/chunks/pages/legacy/blog/[slug]-cf7d57b683b98093.js"
    ]
  }
}
```

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/_not-found/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/2200cc46-8888eb43b3e410d8.js",
      "static/chunks/945-25bcc0729128f665.js",
      "static/chunks/main-app-2af625d88cf03887.js",
      "static/chunks/app/_not-found/page-1ea02247100c432b.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/2200cc46-8888eb43b3e410d8.js",
      "static/chunks/945-25bcc0729128f665.js",
      "static/chunks/main-app-2af625d88cf03887.js",
      "static/chunks/app/(marketing)/about/page-863b2f94c80b38d7.js"
    ],
    "/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/2200cc46-8888eb43b3e410d8.js",
      "static/chunks/945-25bcc0729128f665.js",
      "static/chunks/main-app-2af625d88cf03887.js",
      "static/chunks/app/page-a594b93047059cdb.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/2200cc46-8888eb43b3e410d8.js",
      "static/chunks/945-25bcc0729128f665.js",
      "static/chunks/main-app-2af625d88cf03887.js",
      "static/chunks/app/products/[slug]/page-0d2c9c22cd891318.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router | Manifest key              | Gzip total | `next build` First Load JS | Note     |
| --------------------- | ------ | ------------------------- | ---------: | -------------------------: | -------- |
| `/legacy`             | pages  | `/legacy`                 |    81.0 kB |                    81.0 kB | Δ +8 B   |
| `/legacy/about`       | pages  | `/legacy/about`           |    83.0 kB |                    83.0 kB | Δ -41 B  |
| `/legacy/blog/[slug]` | pages  | `/legacy/blog/[slug]`     |    82.6 kB |                    82.5 kB | Δ +81 B  |
| `/`                   | app    | `/page`                   |    87.5 kB |                    87.3 kB | Δ +225 B |
| `/_not-found`         | app    | `/_not-found/page`        |    88.3 kB |                    88.1 kB | Δ +160 B |
| `/about`              | app    | `/(marketing)/about/page` |    89.4 kB |                    89.2 kB | Δ +202 B |
| `/products/[slug]`    | app    | `/products/[slug]/page`   |    89.2 kB |                    88.9 kB | Δ +291 B |

## 15-webpack

### app-router

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` has exact App Router route arrays, including the Route Handler entry in this build.
- Shared/root representation: Shared/root chunks are repeated inside every App Router route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: The Route Handler key is present in `app-build-manifest.json.pages`; the matched `next build` row shows a tiny route payload (`123 B`) plus the shared `103.0 kB` first-load column, so keep it separate from page-route reporting.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/server-reference-manifest.json`
- `static/YiMfcJ5Oqb3Gry9j5PUm8/_buildManifest.js`
- `static/YiMfcJ5Oqb3Gry9j5PUm8/_ssgManifest.js`
- `static/chunks/4188f269-260947d4cd40a441.js`
- `static/chunks/535-aa5fcf2e65d5bead.js`
- `static/chunks/framework-82fce76e1725f96c.js`
- `static/chunks/main-3eeb2d54a3b891d4.js`
- `static/chunks/main-app-70c46d73c3e127a1.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-078f6dfb37dff419.js`
- `types/package.json`

</details>

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/_not-found/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-70c46d73c3e127a1.js",
      "static/chunks/app/_not-found/page-1eeb5ffc593ca880.js"
    ],
    "/api/hello/route": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-70c46d73c3e127a1.js",
      "static/chunks/app/api/hello/route-865b741cacd98f54.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-70c46d73c3e127a1.js",
      "static/chunks/app/(marketing)/about/page-3f6ae7108fc5850d.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-70c46d73c3e127a1.js",
      "static/chunks/app/blog/[slug]/page-911eeb674aa06492.js"
    ],
    "/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-70c46d73c3e127a1.js",
      "static/chunks/app/page-e4e60762ff9ab9aa.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router            | Manifest key              | Gzip total | `next build` First Load JS | Note                                                                 |
| -------------- | ----------------- | ------------------------- | ---------: | -------------------------: | -------------------------------------------------------------------- |
| `/`            | app               | `/page`                   |   103.1 kB |                   103.0 kB | Δ +101 B                                                             |
| `/_not-found`  | app               | `/_not-found/page`        |   103.8 kB |                   104.0 kB | Δ -209 B                                                             |
| `/about`       | app               | `/(marketing)/about/page` |   104.8 kB |                   104.0 kB | Δ +785 B                                                             |
| `/api/hello`   | app-route-handler | `/api/hello/route`        |   102.9 kB |                   103.0 kB | route size is 123 B; shared 103.0 kB first-load column still appears |
| `/blog/[slug]` | app               | `/blog/[slug]/page`       |   104.5 kB |                   104.0 kB | Δ +546 B                                                             |

### pages-router

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `build-manifest.json.pages` has exact Pages Router route-to-chunk arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `dynamic-css-manifest.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/about.js.nft.json`
- `server/pages/index.js.nft.json`
- `static/chunks/framework-82fce76e1725f96c.js`
- `static/chunks/main-a839d92ffbf5ce0c.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-1d629d4957d3a1db.js`
- `static/kaAhjBULsyDAElobpMIaw/_buildManifest.js`
- `static/kaAhjBULsyDAElobpMIaw/_ssgManifest.js`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-a839d92ffbf5ce0c.js",
      "static/chunks/pages/index-3e6a1ddf4d3a27b1.js"
    ],
    "/about": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-a839d92ffbf5ce0c.js",
      "static/chunks/pages/about-f2cc1edff468bd89.js"
    ],
    "/blog/[slug]": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-a839d92ffbf5ce0c.js",
      "static/chunks/pages/blog/[slug]-0a06956d6c8bfab5.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note     |
| -------------- | ------ | -------------- | ---------: | -------------------------: | -------- |
| `/`            | pages  | `/`            |    81.9 kB |                    82.4 kB | Δ -506 B |
| `/about`       | pages  | `/about`       |    83.5 kB |                    84.0 kB | Δ -466 B |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    83.4 kB |                    83.9 kB | Δ -467 B |

### mixed

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`, including the Route Handler entry in this build.
- Shared/root representation: Pages and App Router each repeat their own shared chunks inside per-route arrays. Do not merge the routers: compute intersections separately.
- Route Handler finding: The Route Handler key is present in `app-build-manifest.json.pages`; the matched `next build` row shows a tiny route payload (`127 B`) plus the shared `103.0 kB` first-load column, so keep it separate from page-route reporting.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `dynamic-css-manifest.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/legacy.js.nft.json`
- `server/server-reference-manifest.json`
- `static/chunks/4188f269-260947d4cd40a441.js`
- `static/chunks/535-aa5fcf2e65d5bead.js`
- `static/chunks/framework-82fce76e1725f96c.js`
- `static/chunks/main-3eeb2d54a3b891d4.js`
- `static/chunks/main-app-cc8b7a1c3ee32020.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-078f6dfb37dff419.js`
- `static/iFjffqw8dCmRdpio_JqhR/_buildManifest.js`
- `static/iFjffqw8dCmRdpio_JqhR/_ssgManifest.js`
- `types/package.json`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/legacy": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-3eeb2d54a3b891d4.js",
      "static/chunks/pages/legacy-b6e1a7cd1b76f36e.js"
    ],
    "/legacy/about": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-3eeb2d54a3b891d4.js",
      "static/chunks/pages/legacy/about-0ddb6e5b70c817cc.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-3eeb2d54a3b891d4.js",
      "static/chunks/pages/legacy/blog/[slug]-816afb092802ad00.js"
    ]
  }
}
```

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/_not-found/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-cc8b7a1c3ee32020.js",
      "static/chunks/app/_not-found/page-954ffa3f5852dbef.js"
    ],
    "/api/hello/route": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-cc8b7a1c3ee32020.js",
      "static/chunks/app/api/hello/route-d37c20d0a4164730.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-cc8b7a1c3ee32020.js",
      "static/chunks/app/(marketing)/about/page-23221a5771341a98.js"
    ],
    "/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-cc8b7a1c3ee32020.js",
      "static/chunks/app/page-d37c20d0a4164730.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-cc8b7a1c3ee32020.js",
      "static/chunks/app/products/[slug]/page-8dff91fca20e2b14.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router            | Manifest key              | Gzip total | `next build` First Load JS | Note                                                                 |
| --------------------- | ----------------- | ------------------------- | ---------: | -------------------------: | -------------------------------------------------------------------- |
| `/legacy`             | pages             | `/legacy`                 |    82.9 kB |                    82.9 kB | Δ +4 B                                                               |
| `/legacy/about`       | pages             | `/legacy/about`           |    84.9 kB |                    84.8 kB | Δ +62 B                                                              |
| `/legacy/blog/[slug]` | pages             | `/legacy/blog/[slug]`     |    84.5 kB |                    84.4 kB | Δ +79 B                                                              |
| `/`                   | app               | `/page`                   |   102.9 kB |                   103.0 kB | Δ -75 B                                                              |
| `/_not-found`         | app               | `/_not-found/page`        |   103.8 kB |                   104.0 kB | Δ -210 B                                                             |
| `/about`              | app               | `/(marketing)/about/page` |   104.8 kB |                   105.0 kB | Δ -194 B                                                             |
| `/api/hello`          | app-route-handler | `/api/hello/route`        |   102.9 kB |                   103.0 kB | route size is 127 B; shared 103.0 kB first-load column still appears |
| `/products/[slug]`    | app               | `/products/[slug]/page`   |   104.6 kB |                   104.0 kB | Δ +601 B                                                             |

## 15-turbopack

### app-router

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` still carries exact App Router route arrays under Turbopack in Next 15.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `export-marker.json`
- `fallback-build-manifest.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/server-reference-manifest.json`
- `static/_W7F2ucxL8QXSYNxLJQUX/_buildManifest.js`
- `static/_W7F2ucxL8QXSYNxLJQUX/_clientMiddlewareManifest.json`
- `static/_W7F2ucxL8QXSYNxLJQUX/_ssgManifest.js`
- `static/chunks/02ff9002124ddf15.js`
- `static/chunks/0e0c64984e756cdd.js`
- `static/chunks/3dbedee48a82dc54.js`
- `static/chunks/4a6643251b806884.js`
- `static/chunks/51a33b9b01f841e6.js`
- `static/chunks/57021b7b3c019a1e.js`
- `static/chunks/7c66f53201d75c03.js`
- `static/chunks/a6dad97d9634a72d.js`
- `static/chunks/bd8e7c33d2e5cc46.js`
- `static/chunks/be71cf1b2fe3fd35.js`
- `static/chunks/c16f52ae700b9b0c.js`
- `static/chunks/c4ad13ce314e58d1.js`
- `static/chunks/turbopack-ae97ffef03535977.js`
- `static/chunks/turbopack-bbe6db27cd33c4fa.js`
- `static/chunks/turbopack-efa63d5110fe0380.js`

</details>

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/(marketing)/about/page": [
      "static/chunks/51a33b9b01f841e6.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/7c66f53201d75c03.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ],
    "/_not-found/page": [
      "static/chunks/51a33b9b01f841e6.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/51a33b9b01f841e6.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/02ff9002124ddf15.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ],
    "/page": [
      "static/chunks/51a33b9b01f841e6.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/3dbedee48a82dc54.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key              | Gzip total | `next build` First Load JS | Note     |
| -------------- | ------ | ------------------------- | ---------: | -------------------------: | -------- |
| `/`            | app    | `/page`                   |   114.6 kB |                   114.0 kB | Δ +610 B |
| `/_not-found`  | app    | `/_not-found/page`        |   114.3 kB |                   114.0 kB | Δ +344 B |
| `/about`       | app    | `/(marketing)/about/page` |   116.3 kB |                   116.0 kB | Δ +292 B |
| `/blog/[slug]` | app    | `/blog/[slug]/page`       |   116.1 kB |                   116.0 kB | Δ +53 B  |

### pages-router

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries exact Pages Router route arrays under Turbopack in Next 15.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`. In this fixture the shared core collapses to the one chunk present on every route.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-build-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `export-marker.json`
- `fallback-build-manifest.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/about.js.nft.json`
- `server/pages/index.js.nft.json`
- `server/server-reference-manifest.json`
- `static/4GfCDbToe8ynmn5KMKAWy/_buildManifest.js`
- `static/4GfCDbToe8ynmn5KMKAWy/_clientMiddlewareManifest.json`
- `static/4GfCDbToe8ynmn5KMKAWy/_ssgManifest.js`
- `static/chunks/18c2cce6f06ba927.js`
- `static/chunks/4c56f76eb9575c97.js`
- `static/chunks/d0594aa76f437873.js`
- `static/chunks/d0dccfd58b1135c8.js`
- `static/chunks/e198ddae1ac5bf45.js`
- `static/chunks/f5fd4f6ba8a0dcad.js`
- `static/chunks/turbopack-0a03ff1a62398227.js`
- `static/chunks/turbopack-1faa63ec0730db93.js`
- `static/chunks/turbopack-9540868139d4dbdd.js`
- `static/chunks/turbopack-c2f5c596d437c1d8.js`
- `static/chunks/turbopack-c6c674019381b143.js`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/f5fd4f6ba8a0dcad.js",
      "static/chunks/e198ddae1ac5bf45.js",
      "static/chunks/turbopack-c6c674019381b143.js"
    ],
    "/about": [
      "static/chunks/4c56f76eb9575c97.js",
      "static/chunks/e198ddae1ac5bf45.js",
      "static/chunks/turbopack-1faa63ec0730db93.js"
    ],
    "/blog/[slug]": [
      "static/chunks/d0594aa76f437873.js",
      "static/chunks/e198ddae1ac5bf45.js",
      "static/chunks/turbopack-0a03ff1a62398227.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note       |
| -------------- | ------ | -------------- | ---------: | -------------------------: | ---------- |
| `/`            | pages  | `/`            |    84.4 kB |                    93.5 kB | Δ -9,149 B |
| `/about`       | pages  | `/about`       |    86.4 kB |                    95.5 kB | Δ -9,109 B |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    86.2 kB |                    95.3 kB | Δ -9,135 B |

### mixed

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`.
- Shared/root representation: Pages and App Router each repeat their own shared chunks inside per-route arrays. Do not merge the routers: compute intersections separately.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `export-marker.json`
- `fallback-build-manifest.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/legacy.js.nft.json`
- `server/server-reference-manifest.json`
- `static/C5b0RgHnfqY0Gn5qFax7p/_buildManifest.js`
- `static/C5b0RgHnfqY0Gn5qFax7p/_clientMiddlewareManifest.json`
- `static/C5b0RgHnfqY0Gn5qFax7p/_ssgManifest.js`
- `static/chunks/02d90e606d9b4404.js`
- `static/chunks/032fc25b5471a96d.js`
- `static/chunks/0e0c64984e756cdd.js`
- `static/chunks/25313a698714a344.js`
- `static/chunks/48655ed6c9c9fe09.js`
- `static/chunks/a6dad97d9634a72d.js`
- `static/chunks/aab191742d34e7c7.js`
- `static/chunks/bd8e7c33d2e5cc46.js`
- `static/chunks/be9d1e58378d37b7.js`
- `static/chunks/c16f52ae700b9b0c.js`
- `static/chunks/c4ad13ce314e58d1.js`
- `static/chunks/d409fb7ec1793f8e.js`
- `static/chunks/d454829be9375bbe.js`
- `static/chunks/eef5a39e0bb23e1a.js`
- `static/chunks/turbopack-1c061c89028ac28b.js`
- `static/chunks/turbopack-28b7e45292d7cfa9.js`
- `static/chunks/turbopack-4ba9fcd6544ae823.js`
- `static/chunks/turbopack-6217826459035015.js`
- `static/chunks/turbopack-db678f6af4f13de1.js`
- `static/chunks/turbopack-efa63d5110fe0380.js`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/legacy": [
      "static/chunks/eef5a39e0bb23e1a.js",
      "static/chunks/032fc25b5471a96d.js",
      "static/chunks/turbopack-28b7e45292d7cfa9.js"
    ],
    "/legacy/about": [
      "static/chunks/aab191742d34e7c7.js",
      "static/chunks/032fc25b5471a96d.js",
      "static/chunks/turbopack-1c061c89028ac28b.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/d454829be9375bbe.js",
      "static/chunks/032fc25b5471a96d.js",
      "static/chunks/turbopack-6217826459035015.js"
    ]
  }
}
```

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/(marketing)/about/page": [
      "static/chunks/48655ed6c9c9fe09.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/02d90e606d9b4404.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ],
    "/_not-found/page": [
      "static/chunks/48655ed6c9c9fe09.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ],
    "/page": [
      "static/chunks/48655ed6c9c9fe09.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/48655ed6c9c9fe09.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/25313a698714a344.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router | Manifest key              | Gzip total | `next build` First Load JS | Note       |
| --------------------- | ------ | ------------------------- | ---------: | -------------------------: | ---------- |
| `/legacy`             | pages  | `/legacy`                 |    84.5 kB |                    93.3 kB | Δ -8,754 B |
| `/legacy/about`       | pages  | `/legacy/about`           |    86.9 kB |                    95.6 kB | Δ -8,718 B |
| `/legacy/blog/[slug]` | pages  | `/legacy/blog/[slug]`     |    86.4 kB |                    95.1 kB | Δ -8,665 B |
| `/`                   | app    | `/page`                   |   114.3 kB |                   114.0 kB | Δ +336 B   |
| `/_not-found`         | app    | `/_not-found/page`        |   114.3 kB |                   114.0 kB | Δ +336 B   |
| `/about`              | app    | `/(marketing)/about/page` |   116.3 kB |                   116.0 kB | Δ +304 B   |
| `/products/[slug]`    | app    | `/products/[slug]/page`   |   116.1 kB |                   116.0 kB | Δ +97 B    |

## 16-webpack

### app-router

- Version: `Next.js v16.3.5`
- Build command: `pnpm exec next build --webpack`
- Verdict: UNSUPPORTED — there is no reliable App Router manifest that maps route -> client chunk list under Next 16 webpack builds.
- Shared/root representation: `build-manifest.json.rootMainFiles` does expose the shared/root bootstrap, but the only route-specific source I found is `server/app/**/_client-reference-manifest.js`, and those files do not expose `entryJSFiles`.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` is empty (`clientModules: {}`), so handlers still appear to carry no client JS. The unsupported part is page attribution, not handler detection.
- Why unsupported: The strongest evidence is `server/app/blog/[slug]/page_client-reference-manifest.js`: it contains the blog chunk **and** the unrelated home-page chunk `static/chunks/app/page-*.js`, so a naïve union of `clientModules.*.chunks` would over-count `/blog/[slug]`.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-path-routes-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/prefetch-hints.json`
- `server/server-reference-manifest.json`
- `static/MYvJz5yg1td5xNQ27OCMS/_buildManifest.js`
- `static/MYvJz5yg1td5xNQ27OCMS/_ssgManifest.js`
- `static/chunks/840-af6eaf733920f9a9.js`
- `static/chunks/846cdde3-bbc12c05ca7d2ed5.js`
- `static/chunks/main-app-279bc887aa2197be.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-70c336f9a46f13b1.js`
- `types/package.json`

</details>

**`server/app/blog/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/846cdde3-bbc12c05ca7d2ed5.js",
    "static/chunks/840-af6eaf733920f9a9.js",
    "static/chunks/main-app-279bc887aa2197be.js"
  ],
  "route": "/blog/[slug]/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "_components/shared-shell.tsx": ["177", "static/chunks/app/layout-e4805bfebfc78716.js"],
    "blog/[slug]/blog-client.tsx": [
      "953",
      "static/chunks/app/blog/%5Bslug%5D/page-269f952689b39a98.js"
    ],
    "_components/home-client.tsx": ["974", "static/chunks/app/page-bd452c302497fab4.js"]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route | Router | Manifest key | Gzip total | `next build` First Load JS | Note                                                   |
| ----- | ------ | ------------ | ---------: | -------------------------: | ------------------------------------------------------ |
| —     | —      | —            |          — |                          — | No reliable per-route app-router chunk list was found. |

### pages-router

- Version: `Next.js v16.3.5`
- Build command: `pnpm exec next build --webpack`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries exact Pages Router route arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `dynamic-css-manifest.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/about.js.nft.json`
- `server/pages/index.js.nft.json`
- `static/AxyaQcycU3Q85MHhalqki/_buildManifest.js`
- `static/AxyaQcycU3Q85MHhalqki/_ssgManifest.js`
- `static/chunks/framework-147d2e36b83bcf32.js`
- `static/chunks/main-960ccc25d30c261b.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-8b8979e85a85b71d.js`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-147d2e36b83bcf32.js",
      "static/chunks/main-960ccc25d30c261b.js",
      "static/chunks/pages/index-bca13d2e243b0dad.js"
    ],
    "/about": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-147d2e36b83bcf32.js",
      "static/chunks/main-960ccc25d30c261b.js",
      "static/chunks/pages/about-88a42692d7a9f140.js"
    ],
    "/blog/[slug]": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-147d2e36b83bcf32.js",
      "static/chunks/main-960ccc25d30c261b.js",
      "static/chunks/pages/blog/[slug]-71bdbb6f1066391c.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note                                              |
| -------------- | ------ | -------------- | ---------: | -------------------------: | ------------------------------------------------- |
| `/`            | pages  | `/`            |    86.0 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/about`       | pages  | `/about`       |    87.7 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    87.6 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |

### mixed

- Version: `Next.js v16.3.5`
- Build command: `pnpm exec next build --webpack`
- Verdict: SUPPORTED for Pages Router routes — `build-manifest.json.pages` still covers that half, but the App Router half remains unsupported.
- Shared/root representation: Pages Router still repeats shared chunks per route. The App Router half only exposes `build-manifest.json.rootMainFiles` plus ambiguous `server/app/**/_client-reference-manifest.js` files.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` is empty, and because App Router page attribution is still ambiguous, the computed totals below intentionally cover only the Pages Router half.
- Why partially supported: The App Router ambiguity is still real for the mixed app: the client-reference manifests exist, but they do not have `entryJSFiles`, and `clientModules` can still over-report chunks from sibling routes. The fixture is therefore supported only for the Pages Router half.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-path-routes-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `dynamic-css-manifest.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/legacy.js.nft.json`
- `server/prefetch-hints.json`
- `server/server-reference-manifest.json`
- `static/chunks/840-af6eaf733920f9a9.js`
- `static/chunks/846cdde3-bbc12c05ca7d2ed5.js`
- `static/chunks/framework-147d2e36b83bcf32.js`
- `static/chunks/main-a4abc6004529b25c.js`
- `static/chunks/main-app-8f968358882b3129.js`
- `static/chunks/polyfills-42372ed130431b0a.js`
- `static/chunks/webpack-70c336f9a46f13b1.js`
- `static/xgMUbCtWE738uVcIWAesN/_buildManifest.js`
- `static/xgMUbCtWE738uVcIWAesN/_ssgManifest.js`
- `types/package.json`

</details>

**`build-manifest.json` excerpt**

```json
{
  "rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/846cdde3-bbc12c05ca7d2ed5.js",
    "static/chunks/840-af6eaf733920f9a9.js",
    "static/chunks/main-app-8f968358882b3129.js"
  ],
  "pages": {
    "/legacy": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-147d2e36b83bcf32.js",
      "static/chunks/main-a4abc6004529b25c.js",
      "static/chunks/pages/legacy-3415fba2be7f15e4.js"
    ],
    "/legacy/about": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-147d2e36b83bcf32.js",
      "static/chunks/main-a4abc6004529b25c.js",
      "static/chunks/pages/legacy/about-b841754588501cae.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-147d2e36b83bcf32.js",
      "static/chunks/main-a4abc6004529b25c.js",
      "static/chunks/pages/legacy/blog/[slug]-c99c5723dd2d3937.js"
    ]
  }
}
```

**`server/app/products/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/846cdde3-bbc12c05ca7d2ed5.js",
    "static/chunks/840-af6eaf733920f9a9.js",
    "static/chunks/main-app-8f968358882b3129.js"
  ],
  "route": "/products/[slug]/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "shared-shell.tsx": ["177", "static/chunks/app/layout-8abe30ec7e1ace1c.js"],
    "products/[slug]/product-client.tsx": [
      "221",
      "static/chunks/app/products/%5Bslug%5D/page-0bb3774162177d4f.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router | Manifest key          | Gzip total | `next build` First Load JS | Note                                              |
| --------------------- | ------ | --------------------- | ---------: | -------------------------: | ------------------------------------------------- |
| `/legacy`             | pages  | `/legacy`             |    86.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/legacy/about`       | pages  | `/legacy/about`       |    88.8 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/legacy/blog/[slug]` | pages  | `/legacy/blog/[slug]` |    88.4 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |

## 16-turbopack

### app-router

- Version: `Next.js v16.3.5`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — use `build-manifest.json.rootMainFiles` as the shared bootstrap and `server/app/**/_client-reference-manifest.js` `entryJSFiles` for per-route additions.
- Shared/root representation: Shared/root chunks live in `build-manifest.json.rootMainFiles`; per-route additions live in each route’s `entryJSFiles`. Full first-load JS is `rootMainFiles ∪ entryJSFiles[currentRoute]`.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` has empty `clientModules` and empty `entryJSFiles`, so it carries no client JS.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-path-routes-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `diagnostics/route-bundle-stats.json`
- `export-marker.json`
- `fallback-build-manifest.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/prefetch-hints.json`
- `server/server-reference-manifest.json`
- `static/chunks/0bkymafeh5y29.js`
- `static/chunks/0cz1d0mv5g_q7.js`
- `static/chunks/0en84hz55zeo4.js`
- `static/chunks/2i-kqpde7pdef.js`
- `static/chunks/2k_rnqnozrodl.js`
- `static/chunks/34tyfk779f5_o.js`
- `static/chunks/3gzbjf3balqow.js`
- `static/chunks/3s5pmkd2ir1yc.js`
- `static/chunks/40jnpcxq3aokl.js`
- `static/chunks/turbopack-2eugc5apgy_de.js`
- `static/zpy0tQmkscZ0auPhhe9S-/_buildManifest.js`
- `static/zpy0tQmkscZ0auPhhe9S-/_clientMiddlewareManifest.js`
- `static/zpy0tQmkscZ0auPhhe9S-/_ssgManifest.js`

</details>

**`server/app/blog/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/3s5pmkd2ir1yc.js",
    "static/chunks/0bkymafeh5y29.js",
    "static/chunks/3gzbjf3balqow.js",
    "static/chunks/turbopack-2eugc5apgy_de.js"
  ],
  "route": "/blog/[slug]/page",
  "entryJSFiles": {
    "[project]/app/layout": ["static/chunks/40jnpcxq3aokl.js"],
    "[project]/node_modules/next/dist/client/components/builtin/global-error": [
      "static/chunks/40jnpcxq3aokl.js"
    ],
    "[project]/app/blog/[slug]/page": [
      "static/chunks/40jnpcxq3aokl.js",
      "static/chunks/2i-kqpde7pdef.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route            | Router            | Manifest key              | Gzip total | `next build` First Load JS | Note                                                    |
| ---------------- | ----------------- | ------------------------- | ---------: | -------------------------: | ------------------------------------------------------- |
| `/`              | app               | `/page`                   |   134.2 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/_global-error` | app               | `/_global-error/page`     |   133.4 kB |                        N/A | not listed in `next build`; computed from manifest only |
| `/_not-found`    | app               | `/_not-found/page`        |   134.0 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/about`         | app               | `/(marketing)/about/page` |   135.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/api/hello`     | app-route-handler | `/api/hello/route`        |        0 B |                        N/A | empty client-manifest entry                             |
| `/blog/[slug]`   | app               | `/blog/[slug]/page`       |   135.7 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |

### pages-router

- Version: `Next.js v16.3.5`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries exact Pages Router route arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `diagnostics/route-bundle-stats.json`
- `export-marker.json`
- `fallback-build-manifest.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/about.js.nft.json`
- `server/pages/index.js.nft.json`
- `server/server-reference-manifest.json`
- `static/chunks/011cr1ctyew0l.js`
- `static/chunks/0asdqsumq94hd.js`
- `static/chunks/0n9xg-ov62bj8.js`
- `static/chunks/0t_d48fjt-pgd.js`
- `static/chunks/1gsjxec3apija.js`
- `static/chunks/21tps7_8--n7y.js`
- `static/chunks/21z7_s-9x_wfn.js`
- `static/chunks/2a7dl13cdt5pe.js`
- `static/chunks/2bdwv7lbw8z27.js`
- `static/chunks/3tygis6-airaj.js`
- `static/chunks/3vpdt04lpmtpy.js`
- `static/chunks/turbopack-17hbxysvgok4y.js`
- `static/chunks/turbopack-1_n72z2u9cle2.js`
- `static/chunks/turbopack-1eunb37odaw4x.js`
- `static/chunks/turbopack-20yi3sfkhuub5.js`
- `static/chunks/turbopack-2a11r_2tzgb52.js`
- `static/sUmy5zgaoc6fyKSyR_j4m/_buildManifest.js`
- `static/sUmy5zgaoc6fyKSyR_j4m/_clientMiddlewareManifest.js`
- `static/sUmy5zgaoc6fyKSyR_j4m/_ssgManifest.js`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/1gsjxec3apija.js",
      "static/chunks/21z7_s-9x_wfn.js",
      "static/chunks/turbopack-20yi3sfkhuub5.js"
    ],
    "/about": [
      "static/chunks/21tps7_8--n7y.js",
      "static/chunks/21z7_s-9x_wfn.js",
      "static/chunks/turbopack-1_n72z2u9cle2.js"
    ],
    "/blog/[slug]": [
      "static/chunks/0asdqsumq94hd.js",
      "static/chunks/21z7_s-9x_wfn.js",
      "static/chunks/turbopack-2a11r_2tzgb52.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note                                              |
| -------------- | ------ | -------------- | ---------: | -------------------------: | ------------------------------------------------- |
| `/`            | pages  | `/`            |    87.7 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/about`       | pages  | `/about`       |    89.7 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    89.5 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |

### mixed

- Version: `Next.js v16.3.5`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `server/app/**/_client-reference-manifest.js` `entryJSFiles` plus `build-manifest.json.rootMainFiles`.
- Shared/root representation: Pages Router repeats its shared chunk per route. App Router splits shared bootstrap into `build-manifest.json.rootMainFiles` and per-route additions into `entryJSFiles`; compute them separately.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` has empty `clientModules` and empty `entryJSFiles`, so it carries no client JS.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `app-path-routes-manifest.json`
- `build-manifest.json`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `diagnostics/route-bundle-stats.json`
- `export-marker.json`
- `fallback-build-manifest.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/app/page.js.nft.json`
- `server/app/page_client-reference-manifest.js`
- `server/functions-config-manifest.json`
- `server/middleware-manifest.json`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/pages/_app.js.nft.json`
- `server/pages/_document.js.nft.json`
- `server/pages/_error.js.nft.json`
- `server/pages/legacy.js.nft.json`
- `server/prefetch-hints.json`
- `server/server-reference-manifest.json`
- `static/NvPjBwBI4Oq0trgwRuQww/_buildManifest.js`
- `static/NvPjBwBI4Oq0trgwRuQww/_clientMiddlewareManifest.js`
- `static/NvPjBwBI4Oq0trgwRuQww/_ssgManifest.js`
- `static/chunks/00v2okdo1-jt-.js`
- `static/chunks/0bkymafeh5y29.js`
- `static/chunks/0cz1d0mv5g_q7.js`
- `static/chunks/0htcn5s37ljez.js`
- `static/chunks/0lpk04d97l_im.js`
- `static/chunks/1o-g9w5730e9e.js`
- `static/chunks/1u7d3g9ui9k6u.js`
- `static/chunks/2-apn50eyy52b.js`
- `static/chunks/21q6yvxhi5l8-.js`
- `static/chunks/2haomdwomvyh9.js`
- `static/chunks/2o49p9j2lahnv.js`
- `static/chunks/2o7ne259rpay0.js`
- `static/chunks/2swr6i7d99d2a.js`
- `static/chunks/34tyfk779f5_o.js`
- `static/chunks/3g2uu3obvkrxr.js`
- `static/chunks/3gzbjf3balqow.js`
- `static/chunks/3ny-k9syxy-bl.js`
- `static/chunks/3rv309hozskqw.js`
- `static/chunks/3s5pmkd2ir1yc.js`
- `static/chunks/turbopack-00ndqac14ds7f.js`
- `static/chunks/turbopack-0kf93j3exu-em.js`
- `static/chunks/turbopack-1urz3umtsnv4k.js`
- `static/chunks/turbopack-2eugc5apgy_de.js`
- `static/chunks/turbopack-2uew38sfeoq-_.js`
- `static/chunks/turbopack-431mxpgg7fdof.js`

</details>

**`build-manifest.json` excerpt**

```json
{
  "rootMainFiles": [
    "static/chunks/3s5pmkd2ir1yc.js",
    "static/chunks/0bkymafeh5y29.js",
    "static/chunks/3gzbjf3balqow.js",
    "static/chunks/turbopack-2eugc5apgy_de.js"
  ],
  "pages": {
    "/legacy": [
      "static/chunks/2o7ne259rpay0.js",
      "static/chunks/2swr6i7d99d2a.js",
      "static/chunks/turbopack-0kf93j3exu-em.js"
    ],
    "/legacy/about": [
      "static/chunks/3g2uu3obvkrxr.js",
      "static/chunks/2swr6i7d99d2a.js",
      "static/chunks/turbopack-1urz3umtsnv4k.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/3ny-k9syxy-bl.js",
      "static/chunks/2swr6i7d99d2a.js",
      "static/chunks/turbopack-431mxpgg7fdof.js"
    ]
  }
}
```

**`server/app/products/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/3s5pmkd2ir1yc.js",
    "static/chunks/0bkymafeh5y29.js",
    "static/chunks/3gzbjf3balqow.js",
    "static/chunks/turbopack-2eugc5apgy_de.js"
  ],
  "route": "/products/[slug]/page",
  "entryJSFiles": {
    "[project]/app/layout": ["static/chunks/0lpk04d97l_im.js"],
    "[project]/node_modules/next/dist/client/components/builtin/global-error": [
      "static/chunks/0lpk04d97l_im.js"
    ],
    "[project]/app/products/[slug]/page": [
      "static/chunks/0lpk04d97l_im.js",
      "static/chunks/00v2okdo1-jt-.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router            | Manifest key              | Gzip total | `next build` First Load JS | Note                                                    |
| --------------------- | ----------------- | ------------------------- | ---------: | -------------------------: | ------------------------------------------------------- |
| `/legacy`             | pages             | `/legacy`                 |    87.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/legacy/about`       | pages             | `/legacy/about`           |    90.3 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/legacy/blog/[slug]` | pages             | `/legacy/blog/[slug]`     |    89.8 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/`                   | app               | `/page`                   |   133.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/_global-error`      | app               | `/_global-error/page`     |   133.4 kB |                        N/A | not listed in `next build`; computed from manifest only |
| `/_not-found`         | app               | `/_not-found/page`        |   133.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/about`              | app               | `/(marketing)/about/page` |   135.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |
| `/api/hello`          | app-route-handler | `/api/hello/route`        |        0 B |                        N/A | empty client-manifest entry                             |
| `/products/[slug]`    | app               | `/products/[slug]/page`   |   135.7 kB |                        N/A | Next 16 no longer prints a `First Load JS` column       |

## External research

### `runs.using: node24` validity

- Yes: the current GitHub Actions metadata syntax reference explicitly documents `runs.using: "node24"` for JavaScript actions and shows it in the example block. Source: <https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runs-for-javascript-actions>.
- GitHub’s 2026-09-23 changelog says: “Runners now use Node 24 for JavaScript actions … update its `runs.using` value to `node24`.” Source: <https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/>.

### `@actions/artifact` v2 `downloadArtifact` and `findBy`

- I inspected `@actions/artifact@2.2.2` directly in scratch. The shipped TypeScript signature is:

```ts
downloadArtifact(artifactId: number, options?: DownloadArtifactOptions & FindOptions): Promise<DownloadArtifactResponse>
```

- `DownloadArtifactOptions` only carries `path?: string` in that version, and `DownloadArtifactResponse` carries `downloadPath?: string`.
- `FindOptions` is `findBy?: { token: string; workflowRunId: number; repositoryOwner: string; repositoryName: string; }`.
- The official README says cross-run / cross-repo download works only when `options.findBy` is supplied and the token has `actions:read` on the target repository. Sources: <https://github.com/actions/toolkit/blob/main/packages/artifact/README.md> and the installed typings under `lib/internal/client.d.ts` / `lib/internal/shared/interfaces.d.ts` from `@actions/artifact@2.2.2`.

### GitHub REST API workflow-run / artifacts fields

- Official docs:
  - workflow runs: <https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-repository>
  - workflow run artifacts: <https://docs.github.com/en/rest/actions/artifacts?apiVersion=2022-11-28#list-workflow-run-artifacts>
- Real `gh api` sample from `actions/toolkit` confirms the field shapes:

```json
{
  "workflow_runs": [
    {
      "id": 36017223493,
      "head_branch": "tunc-d-artifact-client-retry-after",
      "head_repository": {
        "id": 1385572789,
        "full_name": "tunc-d/toolkit"
      }
    }
  ]
}
```

```json
{
  "artifacts": [
    {
      "name": "report.html",
      "workflow_run": {
        "id": 36017223090,
        "head_branch": "tunc-d-artifact-client-retry-after",
        "head_repository_id": 1385572789,
        "head_sha": "21f75b911cd0477b107c9548755fcdf9ea4921b6",
        "repository_id": 182299236
      }
    }
  ]
}
```

- So the workflow-runs list endpoint exposes `head_branch` and the full `head_repository` object, and the workflow-run-artifacts list endpoint exposes a nested `workflow_run` object with `head_branch` plus `head_repository_id` (not the full repository object).
