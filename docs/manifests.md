# Next.js manifest research

All installs/builds ran outside the repo in `$HOME/.copilot-nextjs-bundle-analysis-action-scratch`. The committed fixtures under `fixtures/next/**` are trimmed copies that keep the manifest evidence plus referenced client JS chunks only.

## Normalization rules used in this research

- App Router manifest keys were normalized exactly like the existing reference implementation: strip the trailing `/page` or `/route`, drop route-group segments like `(marketing)`, and keep intercepting-route markers and parallel-route markers unchanged.
- File sets were deduplicated before sizing (`Set` semantics).
- Gzip sizes were computed from the actual emitted files under `.next/` with Node `zlib.gzipSync`.
- If a combo had no reliable manifest-based route -> client-chunk mapping, I marked it **UNSUPPORTED** instead of guessing.

## Final support matrix

| Combo        | App Router                                                                                                                                          | Pages Router                            | Mixed app                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| 14-webpack   | SUPPORTED — `app-build-manifest.json.pages`                                                                                                         | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — split by `build-manifest.json.pages` and `app-build-manifest.json.pages`      |
| 15-webpack   | SUPPORTED — `app-build-manifest.json.pages` (Route Handler entry is quirky; filter it)                                                              | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — split by `build-manifest.json.pages` and `app-build-manifest.json.pages`      |
| 15-turbopack | SUPPORTED — `app-build-manifest.json.pages`                                                                                                         | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — split by `build-manifest.json.pages` and `app-build-manifest.json.pages`      |
| 16-webpack   | UNSUPPORTED — no reliable App Router route->chunks manifest; `*_client-reference-manifest.js` lacks `entryJSFiles` and over-includes sibling chunks | SUPPORTED — `build-manifest.json.pages` | UNSUPPORTED overall — pages half supported, app half unsupported                          |
| 16-turbopack | SUPPORTED — `build-manifest.json.rootMainFiles` + `server/app/**/_client-reference-manifest.js` `entryJSFiles`                                      | SUPPORTED — `build-manifest.json.pages` | SUPPORTED — pages via `build-manifest.json.pages`, app via `rootMainFiles ∪ entryJSFiles` |

## 14-webpack

### app-router

- Version: `Next.js v14.2.35`
- Build command: `npx next build`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` has exact App Router route-to-chunk arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build, so there is no client-JS entry to count.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.tsbuildinfo`
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
- `server/font-manifest.json`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `server/webpack-runtime.js`
- `trace`
- `types/package.json`

</details>

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/_not-found/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/fd9d1056-749e5812300142af.js",
      "static/chunks/117-589e4dfc9479c5ec.js",
      "static/chunks/main-app-125f314e44459ca0.js",
      "static/chunks/app/_not-found/page-dcb83ba3e4d0aafd.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/fd9d1056-749e5812300142af.js",
      "static/chunks/117-589e4dfc9479c5ec.js",
      "static/chunks/main-app-125f314e44459ca0.js",
      "static/chunks/app/blog/[slug]/page-349c02b71ff5c19f.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/fd9d1056-749e5812300142af.js",
      "static/chunks/117-589e4dfc9479c5ec.js",
      "static/chunks/main-app-125f314e44459ca0.js",
      "static/chunks/app/(marketing)/about/page-6dec608681df7b41.js"
    ],
    "/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/fd9d1056-749e5812300142af.js",
      "static/chunks/117-589e4dfc9479c5ec.js",
      "static/chunks/main-app-125f314e44459ca0.js",
      "static/chunks/app/page-502a519fafe0a1c9.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key              | Gzip total | `next build` First Load JS | Note     |
| -------------- | ------ | ------------------------- | ---------: | -------------------------: | -------- |
| `/`            | app    | `/page`                   |    87.7 kB |                    87.5 kB | Δ +230 B |
| `/_not-found`  | app    | `/_not-found/page`        |    88.3 kB |                    88.1 kB | Δ +194 B |
| `/about`       | app    | `/(marketing)/about/page` |    89.4 kB |                    89.0 kB | Δ +416 B |
| `/blog/[slug]` | app    | `/blog/[slug]/page`       |    89.2 kB |                    88.8 kB | Δ +374 B |

### pages-router

- Version: `Next.js v14.2.35`
- Build command: `npx next build`
- Verdict: SUPPORTED — `build-manifest.json.pages` has exact Pages Router route-to-chunk arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `build-manifest.json`
- `cache/.tsbuildinfo`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.json`
- `routes-manifest.json`
- `server/font-manifest.json`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/webpack-runtime.js`
- `trace`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/webpack-4e7214a60fad8e88.js",
      "static/chunks/framework-64ad27b21261a9ce.js",
      "static/chunks/main-fc56ac81e639fb5e.js",
      "static/chunks/pages/index-d884f753438059de.js"
    ],
    "/about": [
      "static/chunks/webpack-4e7214a60fad8e88.js",
      "static/chunks/framework-64ad27b21261a9ce.js",
      "static/chunks/main-fc56ac81e639fb5e.js",
      "static/chunks/pages/about-cfb204281e563b49.js"
    ],
    "/blog/[slug]": [
      "static/chunks/webpack-4e7214a60fad8e88.js",
      "static/chunks/framework-64ad27b21261a9ce.js",
      "static/chunks/main-fc56ac81e639fb5e.js",
      "static/chunks/pages/blog/[slug]-adc939d8bd6c5d55.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note     |
| -------------- | ------ | -------------- | ---------: | -------------------------: | -------- |
| `/`            | pages  | `/`            |    80.1 kB |                    80.6 kB | Δ -539 B |
| `/about`       | pages  | `/about`       |    81.7 kB |                    82.2 kB | Δ -494 B |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    81.6 kB |                    82.1 kB | Δ -500 B |

### mixed

- Version: `Next.js v14.2.35`
- Build command: `npx next build`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`.
- Shared/root representation: Pages and App Router each repeat their own shared chunks inside per-route arrays. Do not merge the routers: compute intersections separately.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.tsbuildinfo`
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
- `server/font-manifest.json`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `server/webpack-runtime.js`
- `trace`
- `types/package.json`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/legacy": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/framework-4be839806aa8e2d3.js",
      "static/chunks/main-64643a319948e483.js",
      "static/chunks/pages/legacy-7e15c1233f75d10d.js"
    ],
    "/legacy/about": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/framework-4be839806aa8e2d3.js",
      "static/chunks/main-64643a319948e483.js",
      "static/chunks/pages/legacy/about-de574b94faf929f0.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/framework-4be839806aa8e2d3.js",
      "static/chunks/main-64643a319948e483.js",
      "static/chunks/pages/legacy/blog/[slug]-81dfe60196f71e89.js"
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
      "static/chunks/fd9d1056-749e5812300142af.js",
      "static/chunks/117-5224ad61d65dc0fd.js",
      "static/chunks/main-app-fc18058195f81f51.js",
      "static/chunks/app/_not-found/page-8564e5294bcc32ae.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/fd9d1056-749e5812300142af.js",
      "static/chunks/117-5224ad61d65dc0fd.js",
      "static/chunks/main-app-fc18058195f81f51.js",
      "static/chunks/app/(marketing)/about/page-79bb6cd4cae233dc.js"
    ],
    "/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/fd9d1056-749e5812300142af.js",
      "static/chunks/117-5224ad61d65dc0fd.js",
      "static/chunks/main-app-fc18058195f81f51.js",
      "static/chunks/app/page-7957bed30c37d29a.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/webpack-100b9e646d9c912e.js",
      "static/chunks/fd9d1056-749e5812300142af.js",
      "static/chunks/117-5224ad61d65dc0fd.js",
      "static/chunks/main-app-fc18058195f81f51.js",
      "static/chunks/app/products/[slug]/page-103508c8ad9862fe.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router | Manifest key              | Gzip total | `next build` First Load JS | Note     |
| --------------------- | ------ | ------------------------- | ---------: | -------------------------: | -------- |
| `/legacy`             | pages  | `/legacy`                 |    81.0 kB |                    81.0 kB | Δ +1 B   |
| `/legacy/about`       | pages  | `/legacy/about`           |    83.0 kB |                    83.0 kB | Δ -46 B  |
| `/legacy/blog/[slug]` | pages  | `/legacy/blog/[slug]`     |    82.6 kB |                    82.5 kB | Δ +74 B  |
| `/`                   | app    | `/page`                   |    87.6 kB |                    87.3 kB | Δ +259 B |
| `/_not-found`         | app    | `/_not-found/page`        |    88.3 kB |                    88.1 kB | Δ +194 B |
| `/about`              | app    | `/(marketing)/about/page` |    89.4 kB |                    89.2 kB | Δ +235 B |
| `/products/[slug]`    | app    | `/products/[slug]/page`   |    89.2 kB |                    89.0 kB | Δ +229 B |

## 15-webpack

### app-router

- Version: `Next.js v15.5.26`
- Build command: `npx next build`
- Verdict: SUPPORTED for page routes — `app-build-manifest.json.pages` has exact App Router page arrays. Route Handlers are present too, but see the note below.
- Shared/root representation: Shared/root chunks are repeated inside every App Router route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across page entries.
- Route Handler finding: Empirical surprise: `/api/hello/route` is present in `app-build-manifest.json.pages` and points at static chunk files, but `next build` still prints `0 B` route size. This should be treated as a special case and not merged into page reporting.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `server/webpack-runtime.js`
- `trace`
- `types/cache-life.d.ts`
- `types/package.json`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/_not-found/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-7bc992d1df8f0798.js",
      "static/chunks/app/_not-found/page-7059ca6906ca439b.js"
    ],
    "/api/hello/route": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-7bc992d1df8f0798.js",
      "static/chunks/app/api/hello/route-92d17fcc19d0a303.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-7bc992d1df8f0798.js",
      "static/chunks/app/(marketing)/about/page-b3cb027a983d5f0b.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-7bc992d1df8f0798.js",
      "static/chunks/app/blog/[slug]/page-5b8d44ae611c91a3.js"
    ],
    "/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-7bc992d1df8f0798.js",
      "static/chunks/app/page-318748b8c20a1bc0.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router            | Manifest key              | Gzip total | `next build` First Load JS | Note                                                          |
| -------------- | ----------------- | ------------------------- | ---------: | -------------------------: | ------------------------------------------------------------- |
| `/`            | app               | `/page`                   |   103.0 kB |                   103.0 kB | Δ +29 B                                                       |
| `/_not-found`  | app               | `/_not-found/page`        |   103.7 kB |                   103.0 kB | Δ +719 B                                                      |
| `/about`       | app               | `/(marketing)/about/page` |   104.7 kB |                   104.0 kB | Δ +709 B                                                      |
| `/api/hello`   | app-route-handler | `/api/hello/route`        |   102.8 kB |                   103.0 kB | manifest entry exists, but Next still prints `0 B` route size |
| `/blog/[slug]` | app               | `/blog/[slug]/page`       |   104.5 kB |                   104.0 kB | Δ +473 B                                                      |

### pages-router

- Version: `Next.js v15.5.26`
- Build command: `npx next build`
- Verdict: SUPPORTED — `build-manifest.json.pages` has exact Pages Router route-to-chunk arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `server/dynamic-css-manifest.js`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/webpack-runtime.js`
- `trace`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-a6e0b7e30f98059a.js",
      "static/chunks/main-55bbd152dbe0f44d.js",
      "static/chunks/pages/index-91f0548773b61dfd.js"
    ],
    "/about": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-a6e0b7e30f98059a.js",
      "static/chunks/main-55bbd152dbe0f44d.js",
      "static/chunks/pages/about-e3ba95e27b488bd0.js"
    ],
    "/blog/[slug]": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-a6e0b7e30f98059a.js",
      "static/chunks/main-55bbd152dbe0f44d.js",
      "static/chunks/pages/blog/[slug]-b1dd3747f91e7673.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note     |
| -------------- | ------ | -------------- | ---------: | -------------------------: | -------- |
| `/`            | pages  | `/`            |    82.2 kB |                    82.7 kB | Δ -469 B |
| `/about`       | pages  | `/about`       |    83.9 kB |                    84.4 kB | Δ -524 B |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    83.8 kB |                    84.3 kB | Δ -530 B |

### mixed

- Version: `Next.js v15.5.26`
- Build command: `npx next build`
- Verdict: SUPPORTED for page routes — Pages Router routes come from `build-manifest.json.pages`; App Router page routes come from `app-build-manifest.json.pages`.
- Shared/root representation: Pages and App Router each repeat their own shared chunks inside per-route arrays. Do not merge the routers: compute intersections separately.
- Route Handler finding: Empirical surprise: `/api/hello/route` is present in `app-build-manifest.json.pages` and points at static chunk files, but `next build` still prints `0 B` route size.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `server/dynamic-css-manifest.js`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `server/webpack-runtime.js`
- `trace`
- `types/cache-life.d.ts`
- `types/package.json`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/legacy": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-a6e0b7e30f98059a.js",
      "static/chunks/main-a20608a8fe9af970.js",
      "static/chunks/pages/legacy-0220ff303438d0f4.js"
    ],
    "/legacy/about": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-a6e0b7e30f98059a.js",
      "static/chunks/main-a20608a8fe9af970.js",
      "static/chunks/pages/legacy/about-b226d71edea4f404.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-a6e0b7e30f98059a.js",
      "static/chunks/main-a20608a8fe9af970.js",
      "static/chunks/pages/legacy/blog/[slug]-b5d2107fe473b3e5.js"
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
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-e00fd293e90df3e9.js",
      "static/chunks/app/_not-found/page-563b1d8d12feded8.js"
    ],
    "/api/hello/route": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-e00fd293e90df3e9.js",
      "static/chunks/app/api/hello/route-633259308b20b2cb.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-e00fd293e90df3e9.js",
      "static/chunks/app/(marketing)/about/page-a4f3e25b9f7032ba.js"
    ],
    "/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-e00fd293e90df3e9.js",
      "static/chunks/app/page-633259308b20b2cb.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4bd1b696-c023c6e3521b1417.js",
      "static/chunks/255-2dbbf79f36f0dfa2.js",
      "static/chunks/main-app-e00fd293e90df3e9.js",
      "static/chunks/app/products/[slug]/page-086fea1c37afe132.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router            | Manifest key              | Gzip total | `next build` First Load JS | Note                                                          |
| --------------------- | ----------------- | ------------------------- | ---------: | -------------------------: | ------------------------------------------------------------- |
| `/legacy`             | pages             | `/legacy`                 |    83.1 kB |                    83.1 kB | Δ +6 B                                                        |
| `/legacy/about`       | pages             | `/legacy/about`           |    85.1 kB |                    85.0 kB | Δ +65 B                                                       |
| `/legacy/blog/[slug]` | pages             | `/legacy/blog/[slug]`     |    84.7 kB |                    84.6 kB | Δ +83 B                                                       |
| `/`                   | app               | `/page`                   |   102.9 kB |                   103.0 kB | Δ -147 B                                                      |
| `/_not-found`         | app               | `/_not-found/page`        |   103.7 kB |                   103.0 kB | Δ +715 B                                                      |
| `/about`              | app               | `/(marketing)/about/page` |   104.7 kB |                   104.0 kB | Δ +733 B                                                      |
| `/api/hello`          | app-route-handler | `/api/hello/route`        |   102.9 kB |                   103.0 kB | manifest entry exists, but Next still prints `0 B` route size |
| `/products/[slug]`    | app               | `/products/[slug]/page`   |   104.5 kB |                   104.0 kB | Δ +528 B                                                      |

## 15-turbopack

### app-router

- Version: `Next.js v15.5.26`
- Build command: `npx next build --turbopack`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` still carries exact App Router route arrays under Turbopack in Next 15.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `trace`
- `turbopack`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/(marketing)/about/page": [
      "static/chunks/90154b920a3aae89.js",
      "static/chunks/331bcca48c789d08.js",
      "static/chunks/51eef667f749ae26.js",
      "static/chunks/c85a7d07e7b82c9a.js",
      "static/chunks/ef4a2295af59a064.js",
      "static/chunks/49574049bd9060fa.js",
      "static/chunks/turbopack-02729fca2cf8278d.js"
    ],
    "/_not-found/page": [
      "static/chunks/90154b920a3aae89.js",
      "static/chunks/331bcca48c789d08.js",
      "static/chunks/c85a7d07e7b82c9a.js",
      "static/chunks/ef4a2295af59a064.js",
      "static/chunks/49574049bd9060fa.js",
      "static/chunks/turbopack-02729fca2cf8278d.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/90154b920a3aae89.js",
      "static/chunks/331bcca48c789d08.js",
      "static/chunks/ce2acc98364fc739.js",
      "static/chunks/c85a7d07e7b82c9a.js",
      "static/chunks/ef4a2295af59a064.js",
      "static/chunks/49574049bd9060fa.js",
      "static/chunks/turbopack-02729fca2cf8278d.js"
    ],
    "/page": [
      "static/chunks/90154b920a3aae89.js",
      "static/chunks/331bcca48c789d08.js",
      "static/chunks/833c6b0002c1de3a.js",
      "static/chunks/c85a7d07e7b82c9a.js",
      "static/chunks/ef4a2295af59a064.js",
      "static/chunks/49574049bd9060fa.js",
      "static/chunks/turbopack-02729fca2cf8278d.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key              | Gzip total | `next build` First Load JS | Note     |
| -------------- | ------ | ------------------------- | ---------: | -------------------------: | -------- |
| `/`            | app    | `/page`                   |   114.6 kB |                   114.0 kB | Δ +560 B |
| `/_not-found`  | app    | `/_not-found/page`        |   114.3 kB |                   114.0 kB | Δ +294 B |
| `/about`       | app    | `/(marketing)/about/page` |   116.2 kB |                   116.0 kB | Δ +243 B |
| `/blog/[slug]` | app    | `/blog/[slug]/page`       |   116.0 kB |                   116.0 kB | Δ +4 B   |

### pages-router

- Version: `Next.js v15.5.26`
- Build command: `npx next build --turbopack`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries exact Pages Router route arrays under Turbopack in Next 15.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`. In this fixture the shared core collapses to the one chunk present on every route.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-build-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `trace`
- `turbopack`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/df4203137c937d2e.js",
      "static/chunks/dc2557a696061913.js",
      "static/chunks/turbopack-54d4785acfcfb5ee.js"
    ],
    "/about": [
      "static/chunks/8ed5746633588b2a.js",
      "static/chunks/dc2557a696061913.js",
      "static/chunks/turbopack-5fb98cf0f44d3dad.js"
    ],
    "/blog/[slug]": [
      "static/chunks/8afd7e8daf71a21a.js",
      "static/chunks/dc2557a696061913.js",
      "static/chunks/turbopack-30a85c559a731d18.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note       |
| -------------- | ------ | -------------- | ---------: | -------------------------: | ---------- |
| `/`            | pages  | `/`            |    84.2 kB |                    93.3 kB | Δ -9,079 B |
| `/about`       | pages  | `/about`       |    86.3 kB |                    95.3 kB | Δ -9,036 B |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    86.0 kB |                    95.1 kB | Δ -9,065 B |

### mixed

- Version: `Next.js v15.5.26`
- Build command: `npx next build --turbopack`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`.
- Shared/root representation: Pages and App Router each repeat their own shared chunks inside per-route arrays. Do not merge the routers: compute intersections separately.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-build-manifest.json`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `trace`
- `turbopack`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/legacy": [
      "static/chunks/e4b6174a46987f45.js",
      "static/chunks/0b3526917ff5e71c.js",
      "static/chunks/turbopack-4576bf449c24e602.js"
    ],
    "/legacy/about": [
      "static/chunks/ae608b2ac79d1445.js",
      "static/chunks/0b3526917ff5e71c.js",
      "static/chunks/turbopack-158548f224c5d714.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/fb9bea26066cb383.js",
      "static/chunks/0b3526917ff5e71c.js",
      "static/chunks/turbopack-319737e60c8eb58b.js"
    ]
  }
}
```

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/(marketing)/about/page": [
      "static/chunks/36b2491933bb9936.js",
      "static/chunks/331bcca48c789d08.js",
      "static/chunks/d1d94444e0542cc7.js",
      "static/chunks/c85a7d07e7b82c9a.js",
      "static/chunks/ef4a2295af59a064.js",
      "static/chunks/49574049bd9060fa.js",
      "static/chunks/turbopack-02729fca2cf8278d.js"
    ],
    "/_not-found/page": [
      "static/chunks/36b2491933bb9936.js",
      "static/chunks/331bcca48c789d08.js",
      "static/chunks/c85a7d07e7b82c9a.js",
      "static/chunks/ef4a2295af59a064.js",
      "static/chunks/49574049bd9060fa.js",
      "static/chunks/turbopack-02729fca2cf8278d.js"
    ],
    "/page": [
      "static/chunks/36b2491933bb9936.js",
      "static/chunks/331bcca48c789d08.js",
      "static/chunks/c85a7d07e7b82c9a.js",
      "static/chunks/ef4a2295af59a064.js",
      "static/chunks/49574049bd9060fa.js",
      "static/chunks/turbopack-02729fca2cf8278d.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/36b2491933bb9936.js",
      "static/chunks/331bcca48c789d08.js",
      "static/chunks/edd8afe6cb92e338.js",
      "static/chunks/c85a7d07e7b82c9a.js",
      "static/chunks/ef4a2295af59a064.js",
      "static/chunks/49574049bd9060fa.js",
      "static/chunks/turbopack-02729fca2cf8278d.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router | Manifest key              | Gzip total | `next build` First Load JS | Note       |
| --------------------- | ------ | ------------------------- | ---------: | -------------------------: | ---------- |
| `/legacy`             | pages  | `/legacy`                 |    84.5 kB |                    93.2 kB | Δ -8,714 B |
| `/legacy/about`       | pages  | `/legacy/about`           |    86.8 kB |                    95.5 kB | Δ -8,683 B |
| `/legacy/blog/[slug]` | pages  | `/legacy/blog/[slug]`     |    86.4 kB |                    95.0 kB | Δ -8,634 B |
| `/`                   | app    | `/page`                   |   114.3 kB |                   114.0 kB | Δ +286 B   |
| `/_not-found`         | app    | `/_not-found/page`        |   114.3 kB |                   114.0 kB | Δ +286 B   |
| `/about`              | app    | `/(marketing)/about/page` |   116.3 kB |                   116.0 kB | Δ +255 B   |
| `/products/[slug]`    | app    | `/products/[slug]/page`   |   116.0 kB |                   116.0 kB | Δ +47 B    |

## 16-webpack

### app-router

- Version: `Next.js v16.3.6`
- Build command: `npx next build --webpack`
- Verdict: UNSUPPORTED — there is no reliable App Router manifest that maps route -> client chunk list under Next 16 webpack builds.
- Shared/root representation: `build-manifest.json.rootMainFiles` does expose the shared/root bootstrap, but the only route-specific source I found is `server/app/**/_client-reference-manifest.js`, and those files do not expose `entryJSFiles`.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` is empty (`clientModules: {}`), so handlers still appear to carry no client JS. The unsupported part is page attribution, not handler detection.
- Why unsupported: The strongest evidence is `server/app/blog/[slug]/page_client-reference-manifest.js`: it contains the blog chunk **and** the unrelated home-page chunk `static/chunks/app/page-*.js`, so a naïve union of `clientModules.*.chunks` would over-count `/blog/[slug]`. I verified this against the generated HTML in scratch: `/about` loads only `layout` + `about/page`, not the home-page chunk.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
- `diagnostics/build-diagnostics.json`
- `diagnostics/framework.json`
- `export-marker.json`
- `images-manifest.json`
- `next-minimal-server.js.nft.json`
- `next-server.js.nft.json`
- `package.json`
- `prerender-manifest.json`
- `react-loadable-manifest.json`
- `required-server-files.js`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/prefetch-hints.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `server/webpack-runtime.js`
- `trace`
- `trace-build`
- `types/cache-life.d.ts`
- `types/package.json`
- `types/root-params.d.ts`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`server/app/blog/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/4bd1b696-92152b0f5947070d.js",
    "static/chunks/794-a3c6349e754e6fcd.js",
    "static/chunks/main-app-3474bc43f501c60e.js"
  ],
  "route": "/blog/[slug]/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "_components/shared-shell.tsx": ["177", "static/chunks/app/layout-5ce391655f3b4009.js"],
    "blog/[slug]/blog-client.tsx": [
      "953",
      "static/chunks/app/blog/%5Bslug%5D/page-c1ba4ea272ac1169.js"
    ],
    "_components/home-client.tsx": ["974", "static/chunks/app/page-e84c494f6e866bbe.js"]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route | Router | Manifest key | Gzip total | `next build` First Load JS | Note                                                   |
| ----- | ------ | ------------ | ---------: | -------------------------: | ------------------------------------------------------ |
| —     | —      | —            |          — |                          — | No reliable per-route app-router chunk list was found. |

### pages-router

- Version: `Next.js v16.3.6`
- Build command: `npx next build --webpack`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries exact Pages Router route arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `required-server-files.js`
- `required-server-files.json`
- `routes-manifest.json`
- `server/dynamic-css-manifest.js`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/webpack-runtime.js`
- `trace`
- `trace-build`
- `types/cache-life.d.ts`
- `types/root-params.d.ts`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-d46cfc3e0bd542b9.js",
      "static/chunks/main-1538e9c88ba46744.js",
      "static/chunks/pages/index-c29dfd4cd00f1d9d.js"
    ],
    "/about": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-d46cfc3e0bd542b9.js",
      "static/chunks/main-1538e9c88ba46744.js",
      "static/chunks/pages/about-59c3db2698430e1e.js"
    ],
    "/blog/[slug]": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-d46cfc3e0bd542b9.js",
      "static/chunks/main-1538e9c88ba46744.js",
      "static/chunks/pages/blog/[slug]-cd77c94d464ba54b.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note                                              |
| -------------- | ------ | -------------- | ---------: | -------------------------: | ------------------------------------------------- |
| `/`            | pages  | `/`            |    86.3 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/about`       | pages  | `/about`       |    87.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    87.8 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |

### mixed

- Version: `Next.js v16.3.6`
- Build command: `npx next build --webpack`
- Verdict: UNSUPPORTED for full mixed coverage — Pages Router routes are still supported via `build-manifest.json.pages`, but the App Router half is not reliably attributable under webpack.
- Shared/root representation: Pages Router still repeats shared chunks per route. The App Router half only exposes `build-manifest.json.rootMainFiles` plus ambiguous `server/app/**/_client-reference-manifest.js` files.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` is empty, but page attribution is still ambiguous, so the mixed-app fixture must be treated as unsupported overall for App Router coverage.
- Why unsupported: The same ambiguity exists for the mixed app’s App Router half: the client-reference manifests exist, but they do not have `entryJSFiles`, and `clientModules` over-report chunks from sibling routes.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `required-server-files.js`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/dynamic-css-manifest.js`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/middleware-react-loadable-manifest.js`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/prefetch-hints.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `server/webpack-runtime.js`
- `trace`
- `trace-build`
- `types/cache-life.d.ts`
- `types/package.json`
- `types/root-params.d.ts`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`build-manifest.json` excerpt**

```json
{
  "rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/4bd1b696-92152b0f5947070d.js",
    "static/chunks/794-a3c6349e754e6fcd.js",
    "static/chunks/main-app-72363ea54765bb55.js"
  ],
  "pages": {
    "/legacy": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-d46cfc3e0bd542b9.js",
      "static/chunks/main-3b98c594b659c3da.js",
      "static/chunks/pages/legacy-293c9b501a9e8037.js"
    ],
    "/legacy/about": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-d46cfc3e0bd542b9.js",
      "static/chunks/main-3b98c594b659c3da.js",
      "static/chunks/pages/legacy/about-728fb87195e4fa9f.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-d46cfc3e0bd542b9.js",
      "static/chunks/main-3b98c594b659c3da.js",
      "static/chunks/pages/legacy/blog/[slug]-45eac7a50372ec89.js"
    ]
  }
}
```

**`server/app/products/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/4bd1b696-92152b0f5947070d.js",
    "static/chunks/794-a3c6349e754e6fcd.js",
    "static/chunks/main-app-72363ea54765bb55.js"
  ],
  "route": "/products/[slug]/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "shared-shell.tsx": ["177", "static/chunks/app/layout-b8e9e214099de9d7.js"],
    "products/[slug]/product-client.tsx": [
      "221",
      "static/chunks/app/products/%5Bslug%5D/page-55864590a5aef63f.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router | Manifest key          | Gzip total | `next build` First Load JS | Note                                              |
| --------------------- | ------ | --------------------- | ---------: | -------------------------: | ------------------------------------------------- |
| `/legacy`             | pages  | `/legacy`             |    86.8 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/legacy/about`       | pages  | `/legacy/about`       |    88.7 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/legacy/blog/[slug]` | pages  | `/legacy/blog/[slug]` |    88.4 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |

## 16-turbopack

### app-router

- Version: `Next.js v16.3.6`
- Build command: `npx next build`
- Verdict: SUPPORTED — use `build-manifest.json.rootMainFiles` as the shared bootstrap and `server/app/**/_client-reference-manifest.js` `entryJSFiles` for per-route additions.
- Shared/root representation: Shared/root chunks live in `build-manifest.json.rootMainFiles`; per-route additions live in each route’s `entryJSFiles`. Full first-load JS is `rootMainFiles ∪ entryJSFiles[currentRoute]`.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` has empty `clientModules` and empty `entryJSFiles`, so it carries no client JS.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `required-server-files.js`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/prefetch-hints.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `trace`
- `trace-build`
- `turbopack`
- `types/cache-life.d.ts`
- `types/root-params.d.ts`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`server/app/blog/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/3l04zcqx63h3y.js",
    "static/chunks/0cegfsgm6lvdz.js",
    "static/chunks/0bma92pht_c97.js",
    "static/chunks/turbopack-0v-kycb5ehozt.js"
  ],
  "route": "/blog/[slug]/page",
  "entryJSFiles": {
    "[project]/app/layout": ["static/chunks/3om4dxkz9_sdb.js"],
    "[project]/node_modules/next/dist/client/components/builtin/global-error": [
      "static/chunks/3om4dxkz9_sdb.js"
    ],
    "[project]/app/blog/[slug]/page": [
      "static/chunks/3om4dxkz9_sdb.js",
      "static/chunks/2apex_jat7jbo.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route            | Router            | Manifest key              | Gzip total | `next build` First Load JS | Note                                              |
| ---------------- | ----------------- | ------------------------- | ---------: | -------------------------: | ------------------------------------------------- |
| `/`              | app               | `/page`                   |   134.2 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/_global-error` | app               | `/_global-error/page`     |   133.4 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/_not-found`    | app               | `/_not-found/page`        |   133.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/about`         | app               | `/(marketing)/about/page` |   135.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/api/hello`     | app-route-handler | `/api/hello/route`        |        0 B |                        N/A | empty client-manifest entry                       |
| `/blog/[slug]`   | app               | `/blog/[slug]/page`       |   135.6 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |

### pages-router

- Version: `Next.js v16.3.6`
- Build command: `npx next build`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries exact Pages Router route arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `required-server-files.js`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `trace`
- `trace-build`
- `turbopack`
- `types/cache-life.d.ts`
- `types/root-params.d.ts`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`build-manifest.json` excerpt**

```json
{
  "pages": {
    "/": [
      "static/chunks/41ly7sfrjmty4.js",
      "static/chunks/3zu195ta8hez8.js",
      "static/chunks/turbopack-1h56kyqt80ihc.js"
    ],
    "/about": [
      "static/chunks/288sxv-_0k5_w.js",
      "static/chunks/3zu195ta8hez8.js",
      "static/chunks/turbopack-0_u7wny9mgh_j.js"
    ],
    "/blog/[slug]": [
      "static/chunks/1t910kf53ek7h.js",
      "static/chunks/3zu195ta8hez8.js",
      "static/chunks/turbopack-39q9lw06hgy6_.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Router | Manifest key   | Gzip total | `next build` First Load JS | Note                                              |
| -------------- | ------ | -------------- | ---------: | -------------------------: | ------------------------------------------------- |
| `/`            | pages  | `/`            |    87.6 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/about`       | pages  | `/about`       |    89.6 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/blog/[slug]` | pages  | `/blog/[slug]` |    89.4 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |

### mixed

- Version: `Next.js v16.3.6`
- Build command: `npx next build`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `server/app/**/_client-reference-manifest.js` `entryJSFiles` plus `build-manifest.json.rootMainFiles`.
- Shared/root representation: Pages Router repeats its shared chunk per route. App Router splits shared bootstrap into `build-manifest.json.rootMainFiles` and per-route additions into `entryJSFiles`; compute them separately.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` has empty `clientModules` and empty `entryJSFiles`, so it carries no client JS.

<details>
<summary><code>find .next -maxdepth 2 -type f</code></summary>

- `BUILD_ID`
- `app-path-routes-manifest.json`
- `build-manifest.json`
- `cache/.previewinfo`
- `cache/.rscinfo`
- `cache/.tsbuildinfo`
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
- `required-server-files.js`
- `required-server-files.json`
- `routes-manifest.json`
- `server/app-paths-manifest.json`
- `server/functions-config-manifest.json`
- `server/interception-route-rewrite-manifest.js`
- `server/middleware-build-manifest.js`
- `server/middleware-manifest.json`
- `server/next-font-manifest.js`
- `server/next-font-manifest.json`
- `server/pages-manifest.json`
- `server/prefetch-hints.json`
- `server/server-reference-manifest.js`
- `server/server-reference-manifest.json`
- `trace`
- `trace-build`
- `turbopack`
- `types/cache-life.d.ts`
- `types/root-params.d.ts`
- `types/routes.d.ts`
- `types/validator.ts`

</details>

**`build-manifest.json` excerpt**

```json
{
  "rootMainFiles": [
    "static/chunks/3l04zcqx63h3y.js",
    "static/chunks/0cegfsgm6lvdz.js",
    "static/chunks/0bma92pht_c97.js",
    "static/chunks/turbopack-0v-kycb5ehozt.js"
  ],
  "pages": {
    "/legacy": [
      "static/chunks/3j-kcfyg869li.js",
      "static/chunks/1e2ip17p0nt4d.js",
      "static/chunks/turbopack-30-ntc82zvo6h.js"
    ],
    "/legacy/about": [
      "static/chunks/1zn_n18-mt_53.js",
      "static/chunks/1e2ip17p0nt4d.js",
      "static/chunks/turbopack-3m5fdc8hmn6x8.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/2bw12q5prsv_l.js",
      "static/chunks/1e2ip17p0nt4d.js",
      "static/chunks/turbopack-3-cia87a0pk-u.js"
    ]
  }
}
```

**`server/app/products/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/3l04zcqx63h3y.js",
    "static/chunks/0cegfsgm6lvdz.js",
    "static/chunks/0bma92pht_c97.js",
    "static/chunks/turbopack-0v-kycb5ehozt.js"
  ],
  "route": "/products/[slug]/page",
  "entryJSFiles": {
    "[project]/app/layout": ["static/chunks/1ko7tw8p_5i4d.js"],
    "[project]/node_modules/next/dist/client/components/builtin/global-error": [
      "static/chunks/1ko7tw8p_5i4d.js"
    ],
    "[project]/app/products/[slug]/page": [
      "static/chunks/1ko7tw8p_5i4d.js",
      "static/chunks/021jnsyzhq7tv.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Router            | Manifest key              | Gzip total | `next build` First Load JS | Note                                              |
| --------------------- | ----------------- | ------------------------- | ---------: | -------------------------: | ------------------------------------------------- |
| `/legacy`             | pages             | `/legacy`                 |    87.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/legacy/about`       | pages             | `/legacy/about`           |    90.2 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/legacy/blog/[slug]` | pages             | `/legacy/blog/[slug]`     |    89.7 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/`                   | app               | `/page`                   |   133.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/_global-error`      | app               | `/_global-error/page`     |   133.4 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/_not-found`         | app               | `/_not-found/page`        |   133.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/about`              | app               | `/(marketing)/about/page` |   135.9 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |
| `/api/hello`          | app-route-handler | `/api/hello/route`        |        0 B |                        N/A | empty client-manifest entry                       |
| `/products/[slug]`    | app               | `/products/[slug]/page`   |   135.7 kB |                        N/A | Next 16 no longer prints a `First Load JS` column |

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
