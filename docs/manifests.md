# Next.js manifest research

All installs/builds in this refresh ran inside the repo-relative, gitignored `.fixture-scratch/` directory. Each fixture now also commits a pinned `package.json` + `pnpm-lock.yaml` under `fixtures/next/<combo>/<app>/`, and regeneration reuses them with `pnpm install --frozen-lockfile`.

## Normalization rules used in this research

- App Router manifest keys were normalized exactly like the existing reference implementation: strip the trailing `/page` or `/route`, drop route-group segments like `(marketing)`, and keep intercepting-route markers and parallel-route markers unchanged.
- File sets were deduplicated before sizing (`Set` semantics).
- Gzip sizes were computed from the actual emitted files under `.next/` with Node `zlib.gzipSync(..., { level: 9 })`, matching Next's own `First Load JS` compression level.
- Verified against `.fixture-scratch/summary.json`: in the last full refresh, all 44 routes that still print a `First Load JS` value landed within Next's own CLI rounding windows (±500 B for whole-kB output, ±50 B for 1-decimal kB output, ±5 B for 2-decimal kB output) when each App Router route counted only its own page entry. Next 15 webpack App Router routes now also count the layouts and boundaries above them (see the Next 15 webpack bullet below), which `next build` leaves out, so those rows read above the printed value by exactly those chunks. Every other non-zero delta below is print-rounding, not missing or extra files.
- Pages Router first-load JS is always `build-manifest.json.pages['/_app'] ∪ build-manifest.json.pages[route]`. `build-manifest.json.pages[route]` never includes the `/_app` files on its own, but `next build` always counts them.
- Next 15 webpack App Router first-load JS is `app-build-manifest.json.pages[page]` ∪ the entries of `/global-error` and, for each segment from the root down to the page's own, its `layout`, `template`, `error`, `loading` and `not-found` (e.g. `/layout`, `/blog/layout`, `/blog/loading`), where the manifest has them. Webpack gives each of those files its own entry, and no page entry includes their chunks, but every prerendered page's `<script>` tags load them (see the 15-webpack `nested-layouts` section). `next build`'s own `First Load JS` counts the page entry alone, so it under-reports these routes. Next 15 Turbopack's `app-build-manifest.json` has page keys only, and each page entry already includes those chunks, so the same union adds nothing there. A parallel-route slot's page stays a route of its own, and the union adds neither its sibling slots' entries nor slots' `default` entries. On 15-webpack a slot's route therefore leaves out its siblings' code, but on 15-turbopack each slot's page entry already lists every slot's chunks, so there a slot's route includes its siblings' code (see the 15-turbopack `nested-layouts` section).
- The committed fixtures are trimmed evidence copies. Where a JSON manifest exists, the committed JSON set is now just `build-manifest.json` and `app-build-manifest.json`; the rest of the retained evidence is referenced client JS chunks, `server/app/**/_client-reference-manifest.js`, and the kept `server/app/**/*.html` evidence files for the 16-webpack App Router case. The `<details>` file listings below still show the full pre-trim `.next` output recorded in `.fixture-scratch/summary.json`, not only the committed subset.
- Relative to the previous committed fixture snapshot on this branch, the trim reduces `fixtures/next/` from 12.84 MiB / 949 files to 10.30 MiB / 434 files; JSON alone drops from 3.15 MiB / 660 files to 52.3 KiB / 91 files.
- Next's webpack App Router manifests embed the absolute build directory as `*_client-reference-manifest.js` `clientModules` / `entryCSSFiles` keys; that's intrinsic to webpack's manifest shape, not this project's tooling. Only the `.chunks` array values are used for sizing, so the fixture script now rewrites that absolute prefix to a stable `/__fixture__` placeholder when copying these files into the committed fixture, and asserts (`assertNoLeakedAbsolutePaths`) that no copied file still contains the build machine's home directory. `build-manifest.json` / `app-build-manifest.json` never contained an absolute path to begin with; Turbopack's client-reference manifests use opaque module identifiers instead of filesystem paths.
- All 15 combo/app builds exited 0 in this refresh, including `16-webpack`. The Next 16 webpack App Router **UNSUPPORTED** verdict below was re-verified on a clean successful build, not on a swallowed failure.
- The `nested-layouts` app (route-group and nested layouts, a segment's `template`/`error`/`loading`/`not-found`, a root `not-found` and `global-error`, and parallel-route slots) is built only for the two Next 15 combos, whose App Router routes come from `app-build-manifest.json`. Its cells were added later with `pnpm run fixtures --only 15-webpack/nested-layouts --only 15-turbopack/nested-layouts`, and their pinned `package.json`/`pnpm-lock.yaml` reuse the `next@15.5.25` lockfile committed for `15-webpack/app-router`.

## Final support matrix

The latest rebuild leaves the support verdicts unchanged, and this table still matches `.fixture-scratch/summary.json`'s `supported` field for all 15 combo/app entries.

| Combo        | App Router                                                                                                                                                                      | Pages Router                                                                        | Mixed app                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 15-webpack   | SUPPORTED — `app-build-manifest.json.pages[page]` ∪ the `/global-error` entry and the `layout`/`template`/`error`/`loading`/`not-found` entries of every segment above the page | SUPPORTED — `build-manifest.json.pages['/_app'] ∪ build-manifest.json.pages[route]` | SUPPORTED — pages via `pages['/_app'] ∪ pages[route]`, app via the same `app-build-manifest.json.pages` union |
| 15-turbopack | SUPPORTED — `app-build-manifest.json.pages[page]`, which already includes its layouts and boundaries                                                                            | SUPPORTED — `build-manifest.json.pages['/_app'] ∪ build-manifest.json.pages[route]` | SUPPORTED — pages via `pages['/_app'] ∪ pages[route]`, app via `app-build-manifest.json.pages`                |
| 16-webpack   | UNSUPPORTED — `*_client-reference-manifest.js` lacks `entryJSFiles`, and the root `app/page` chunk leaks into other routes' `clientModules` / `entryCSSFiles`                   | SUPPORTED — `build-manifest.json.pages['/_app'] ∪ build-manifest.json.pages[route]` | SUPPORTED — Pages Router half via `pages['/_app'] ∪ pages[route]`; App Router half remains unsupported        |
| 16-turbopack | SUPPORTED — `build-manifest.json.rootMainFiles` + `server/app/**/_client-reference-manifest.js` `entryJSFiles`                                                                  | SUPPORTED — `build-manifest.json.pages['/_app'] ∪ build-manifest.json.pages[route]` | SUPPORTED — pages via `pages['/_app'] ∪ pages[route]`, app via `rootMainFiles ∪ entryJSFiles`                 |

## 15-webpack

### app-router

- Version: `Next.js v15.5.28`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` still carries exact App Router route-to-chunk arrays, once each page's entry is joined with the layout entry above it (see the layout finding).
- Shared/root representation: Shared/root chunks are repeated inside every route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the routes' file sets.
- Layout finding: The root layout has an entry of its own, `/layout`, and no page entry lists its chunk (`static/chunks/app/layout-7b2e7a10d007dd4c.js`, 634 B gzipped), yet `server/app/index.html`, `about.html` and `_not-found.html` all load it with a `<script>` tag. Each route's first load therefore adds the `/layout` entry. `next build`'s printed value leaves it out: counting it, `/_not-found` would print `104 kB`, and `/about` and `/blog/[slug]` would print `105 kB`.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build, so there is no client-JS entry to count.

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
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-843780d195132b92.js",
      "static/chunks/app/_not-found/page-de1c7fd73426a764.js"
    ],
    "/layout": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-843780d195132b92.js",
      "static/chunks/app/layout-7b2e7a10d007dd4c.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-843780d195132b92.js",
      "static/chunks/app/blog/[slug]/page-936ff2f2661f0ae2.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-843780d195132b92.js",
      "static/chunks/app/(marketing)/about/page-d9566a22f715acc6.js"
    ],
    "/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-843780d195132b92.js",
      "static/chunks/app/page-e05b4c7e1e7a05e3.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Computed gzip bytes | `next build` printed value |    Delta | Explanation                                                                                                                              |
| -------------- | ------------------: | -------------------------: | -------: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            |            103.4 kB |                     103 kB |   +406 B | Adds the 634 B `/layout` chunk, which `next build` leaves out; the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`. |
| `/_not-found`  |            104.1 kB |                     103 kB | +1,096 B | Adds the 634 B `/layout` chunk; the page entry alone (103.5 kB) is within the ±500 B window for `103 kB`.                                |
| `/about`       |            104.9 kB |                     104 kB |   +924 B | Adds the 634 B `/layout` chunk; the page entry alone (104.3 kB) is within the ±500 B window for `104 kB`.                                |
| `/api/hello`   |            102.6 kB |                     103 kB |   -407 B | Within Next's ±500 B print-rounding window for `103 kB`.                                                                                 |
| `/blog/[slug]` |            104.7 kB |                     104 kB |   +737 B | Adds the 634 B `/layout` chunk; the page entry alone (104.1 kB) is within the ±500 B window for `104 kB`.                                |

### pages-router

- Version: `Next.js v15.5.28`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries the per-route Pages Router entries.
- Shared/root representation: `build-manifest.json.pages[route]` omits `build-manifest.json.pages['/_app']`, but `next build` always counts those files. Compute each Pages Router route as `pages['/_app'] ∪ pages[route]`; the `/_app` files are the shared Pages Router core.
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
    "/_app": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-f63ed7ab965a40fc.js",
      "static/chunks/pages/_app-7d1ac6deae64c4e2.js"
    ],
    "/": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-f63ed7ab965a40fc.js",
      "static/chunks/pages/index-39762e5175e686a4.js"
    ],
    "/about": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-f63ed7ab965a40fc.js",
      "static/chunks/pages/about-237a4c8176c18a50.js"
    ],
    "/blog/[slug]": [
      "static/chunks/webpack-1d629d4957d3a1db.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-f63ed7ab965a40fc.js",
      "static/chunks/pages/blog/[slug]-ed2b14790dfa2c1a.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Computed gzip bytes | `next build` printed value | Delta | Explanation                                              |
| -------------- | ------------------: | -------------------------: | ----: | -------------------------------------------------------- |
| `/`            |             82.9 kB |                    82.9 kB | -43 B | Within Next's ±50 B print-rounding window for `82.9 kB`. |
| `/about`       |             84.5 kB |                    84.5 kB |  -9 B | Within Next's ±50 B print-rounding window for `84.5 kB`. |
| `/blog/[slug]` |             84.4 kB |                    84.4 kB |  -8 B | Within Next's ±50 B print-rounding window for `84.4 kB`. |

### mixed

- Version: `Next.js v15.5.28`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`, each page's entry joined with the layout entry above it.
- Shared/root representation: Pages Router first-load is `pages['/_app'] ∪ pages[route]`; App Router still repeats shared chunks inside each `app-build-manifest.json.pages` array. Keep the routers separate instead of merging their shared sets.
- Layout finding: As in `app-router`, the root layout's chunk (`static/chunks/app/layout-5a392360f1111d87.js`, 627 B gzipped) is only in the `/layout` entry, and `server/app/index.html`, `about.html` and `_not-found.html` all load it. Counting it, `/_not-found` would print `104 kB`, and `/about` and `/products/[slug]` would print `105 kB`.
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
    "/_app": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-ceb1497bb2d1c060.js",
      "static/chunks/pages/_app-f179a9a89aab1589.js"
    ],
    "/legacy": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-ceb1497bb2d1c060.js",
      "static/chunks/pages/legacy-5d6c2884e004cffb.js"
    ],
    "/legacy/about": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-ceb1497bb2d1c060.js",
      "static/chunks/pages/legacy/about-c56e8e07e0501e3c.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/framework-82fce76e1725f96c.js",
      "static/chunks/main-ceb1497bb2d1c060.js",
      "static/chunks/pages/legacy/blog/[slug]-f72139e392438276.js"
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
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-139844158a3c2041.js",
      "static/chunks/app/_not-found/page-791ea62b985923af.js"
    ],
    "/layout": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-139844158a3c2041.js",
      "static/chunks/app/layout-5a392360f1111d87.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-139844158a3c2041.js",
      "static/chunks/app/(marketing)/about/page-9175ea8961a57440.js"
    ],
    "/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-139844158a3c2041.js",
      "static/chunks/app/page-87a34621a15ac21e.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-139844158a3c2041.js",
      "static/chunks/app/products/[slug]/page-3395606a942335a0.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Computed gzip bytes | `next build` printed value |    Delta | Explanation                                                                                                                              |
| --------------------- | ------------------: | -------------------------: | -------: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/legacy`             |             83.2 kB |                    83.2 kB |    +21 B | Within Next's ±50 B print-rounding window for `83.2 kB`.                                                                                 |
| `/legacy/about`       |             85.2 kB |                    85.2 kB |    -38 B | Within Next's ±50 B print-rounding window for `85.2 kB`.                                                                                 |
| `/legacy/blog/[slug]` |             84.7 kB |                    84.7 kB |    +40 B | Within Next's ±50 B print-rounding window for `84.7 kB`.                                                                                 |
| `/`                   |            103.2 kB |                     103 kB |   +226 B | Adds the 627 B `/layout` chunk, which `next build` leaves out; the page entry alone (102.6 kB) is within the ±500 B window for `103 kB`. |
| `/_not-found`         |            104.1 kB |                     103 kB | +1,091 B | Adds the 627 B `/layout` chunk; the page entry alone (103.5 kB) is within the ±500 B window for `103 kB`.                                |
| `/about`              |            105.1 kB |                     104 kB | +1,094 B | Adds the 627 B `/layout` chunk; the page entry alone (104.5 kB) is within the ±500 B window for `104 kB`.                                |
| `/api/hello`          |            102.6 kB |                     103 kB |   -401 B | Within Next's ±500 B print-rounding window for `103 kB`.                                                                                 |
| `/products/[slug]`    |            104.8 kB |                     104 kB |   +846 B | Adds the 627 B `/layout` chunk; the page entry alone (104.2 kB) is within the ±500 B window for `104 kB`.                                |

### nested-layouts

- Version: `Next.js v15.5.28`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — the same `app-build-manifest.json.pages` union as `app-router`. This app has every kind of entry the union adds.
- Manifest finding: Besides the page keys, the manifest has one key per layout and boundary file: `/global-error`, `/layout`, `/not-found`, `/(marketing)/layout`, `/blog/layout`, `/blog/template`, `/blog/error`, `/blog/loading`, `/blog/not-found`, `/dashboard/layout` and `/dashboard/@analytics/layout`. Each lists the shared runtime chunks plus that file's own chunk, and no other entry lists that chunk.
- First-load finding: Every prerendered page loads, with `<script>` tags, the chunks of the entries above it (table below): the root `global-error`, `layout` and `not-found` on every page, the route group's layout on `/about`, and the blog segment's `layout`, `template`, `error`, `loading` and `not-found` on `/blog/hello`. `next build` prints the page entry alone, so its value is low by those chunks.
- Parallel-route finding: `next build` prints one `/dashboard` row for the URL, which renders `/dashboard/page`, `/dashboard/@team/page` and `/dashboard/@analytics/page`, and `dashboard.html` loads all three plus `/dashboard/@analytics/layout`. The normalization rules keep each slot's page as a route of its own, so `/dashboard` counts neither sibling slot; a first visit to the URL downloads the union of the three rows.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.
- `find .next -maxdepth 2 -type f`: same listing as `app-router`.

**Chunks each prerendered page loads**, beyond the four shared runtime chunks every entry lists and the `nomodule` polyfills (content hashes omitted):

| Page              | Chunks                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`      | `app/global-error`, `app/layout`, `app/not-found`, `app/page`                                                                                                                                   |
| `about.html`      | `app/global-error`, `app/layout`, `app/not-found`, `app/(marketing)/layout`, `app/(marketing)/about/page`                                                                                       |
| `blog/hello.html` | `app/global-error`, `app/layout`, `app/not-found`, `app/blog/layout`, `app/blog/template`, `app/blog/error`, `app/blog/loading`, `app/blog/not-found`, `app/blog/[slug]/page`                   |
| `dashboard.html`  | `app/global-error`, `app/layout`, `app/not-found`, `app/dashboard/layout`, `app/dashboard/page`, `app/dashboard/@team/page`, `app/dashboard/@analytics/layout`, `app/dashboard/@analytics/page` |
| `_not-found.html` | `app/global-error`, `app/layout`, `app/not-found`                                                                                                                                               |

**`app-build-manifest.json` excerpt** (the entries `/blog/[slug]` counts)

```json
{
  "pages": {
    "/global-error": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/global-error-297672ffbd612b9d.js"
    ],
    "/layout": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/layout-0abccb8bbb045ca1.js"
    ],
    "/not-found": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/not-found-de93f799e0908098.js"
    ],
    "/blog/layout": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/blog/layout-296d63de1aab89bc.js"
    ],
    "/blog/template": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/blog/template-037026c69db99e4e.js"
    ],
    "/blog/error": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/blog/error-0f1bd9d2c8c84c05.js"
    ],
    "/blog/loading": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/blog/loading-414be27286c3e5fd.js"
    ],
    "/blog/not-found": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/blog/not-found-4d48c8a9e9e3da0a.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/666922f6-b12f1e837577f4d9.js",
      "static/chunks/540-5449163088239922.js",
      "static/chunks/main-app-9c15a20d71ed91c1.js",
      "static/chunks/app/blog/[slug]/page-b293ca51c6dcdf3e.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

The root entries (`/global-error` 335 B, `/layout` 307 B, `/not-found` 293 B gzipped) add 935 B to every route.

| Route                   | Computed gzip bytes | `next build` printed value |    Delta | Explanation                                                                                                                                                    |
| ----------------------- | ------------------: | -------------------------: | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     |            103.7 kB |                     103 kB |   +686 B | Adds the root entries, which `next build` leaves out; the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`.                                |
| `/_not-found`           |            103.5 kB |                     103 kB |   +523 B | Adds the root entries; the page entry alone (102.6 kB) is within the ±500 B window for `103 kB`.                                                               |
| `/about`                |            104.0 kB |                     103 kB | +1,006 B | Adds the root entries and `/(marketing)/layout` (317 B); the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`.                             |
| `/blog/[slug]`          |            105.2 kB |                     103 kB | +2,219 B | Adds the root entries and the blog segment's five (1,513 B); the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`.                         |
| `/dashboard`            |            104.0 kB |                     103 kB | +1,019 B | Adds the root entries and `/dashboard/layout` (330 B); the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`.                               |
| `/dashboard/@analytics` |            104.3 kB |                        N/A |      N/A | `next build` prints no row for a slot (see the parallel-route finding). Adds the root entries, `/dashboard/layout` and `/dashboard/@analytics/layout` (318 B). |
| `/dashboard/@team`      |            104.0 kB |                        N/A |      N/A | `next build` prints no row for a slot. Adds the root entries and `/dashboard/layout`.                                                                          |

## 15-turbopack

### app-router

- Version: `Next.js v15.5.28`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` still carries exact App Router route-to-chunk arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Layout finding: Unlike 15-webpack, the manifest has page keys only, with no `/layout`. Every page entry already lists the chunk with the root layout's client code (`static/chunks/1723abf6fb3e1b96.js` holds `SharedShell`), and each prerendered page loads exactly its page entry's chunks plus the `nomodule` polyfills. The layout and boundary union finds no entries to add, so these numbers are the page entries'.
- Route Handler finding: The Route Handler key is absent from `app-build-manifest.json.pages` in this build, so there is no client-JS entry to count.

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
    "/_not-found/page": [
      "static/chunks/1723abf6fb3e1b96.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/2de4a43efaf8ad6b.js",
      "static/chunks/8e178bc0b03a8dcc.js",
      "static/chunks/99a256a291dea69c.js",
      "static/chunks/turbopack-646245a19feb0869.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/1723abf6fb3e1b96.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/7aabea74c63ec0c5.js",
      "static/chunks/2de4a43efaf8ad6b.js",
      "static/chunks/8e178bc0b03a8dcc.js",
      "static/chunks/99a256a291dea69c.js",
      "static/chunks/turbopack-646245a19feb0869.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/1723abf6fb3e1b96.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/a6bddc1762069dd9.js",
      "static/chunks/2de4a43efaf8ad6b.js",
      "static/chunks/8e178bc0b03a8dcc.js",
      "static/chunks/99a256a291dea69c.js",
      "static/chunks/turbopack-646245a19feb0869.js"
    ],
    "/page": [
      "static/chunks/1723abf6fb3e1b96.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/dc7b3c3c030346ef.js",
      "static/chunks/2de4a43efaf8ad6b.js",
      "static/chunks/8e178bc0b03a8dcc.js",
      "static/chunks/99a256a291dea69c.js",
      "static/chunks/turbopack-646245a19feb0869.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Computed gzip bytes | `next build` printed value |  Delta | Explanation                                              |
| -------------- | ------------------: | -------------------------: | -----: | -------------------------------------------------------- |
| `/`            |            114.4 kB |                     114 kB | +373 B | Within Next's ±500 B print-rounding window for `114 kB`. |
| `/_not-found`  |            114.1 kB |                     114 kB | +107 B | Within Next's ±500 B print-rounding window for `114 kB`. |
| `/about`       |            115.9 kB |                     116 kB | -111 B | Within Next's ±500 B print-rounding window for `116 kB`. |
| `/blog/[slug]` |            115.7 kB |                     116 kB | -298 B | Within Next's ±500 B print-rounding window for `116 kB`. |

### pages-router

- Version: `Next.js v15.5.28`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries the per-route Pages Router entries.
- Shared/root representation: `build-manifest.json.pages[route]` omits `build-manifest.json.pages['/_app']`, but `next build` always counts those files. Compute each Pages Router route as `pages['/_app'] ∪ pages[route]`; the `/_app` files are the shared Pages Router core.
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
    "/_app": [
      "static/chunks/a79189fa7585459e.js",
      "static/chunks/8273ba1c8f7a4f8d.js",
      "static/chunks/turbopack-b07617b8291c0363.js"
    ],
    "/": [
      "static/chunks/07722972c1b59786.js",
      "static/chunks/8273ba1c8f7a4f8d.js",
      "static/chunks/turbopack-ab9915067cf0e44a.js"
    ],
    "/about": [
      "static/chunks/8fb74ddaeff94335.js",
      "static/chunks/8273ba1c8f7a4f8d.js",
      "static/chunks/turbopack-d8498aa1017dd867.js"
    ],
    "/blog/[slug]": [
      "static/chunks/cdf930499bc6d396.js",
      "static/chunks/8273ba1c8f7a4f8d.js",
      "static/chunks/turbopack-1442980d0c83aac7.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Computed gzip bytes | `next build` printed value | Delta | Explanation                                              |
| -------------- | ------------------: | -------------------------: | ----: | -------------------------------------------------------- |
| `/`            |             93.6 kB |                    93.6 kB | -24 B | Within Next's ±50 B print-rounding window for `93.6 kB`. |
| `/about`       |             95.6 kB |                    95.6 kB |  -1 B | Within Next's ±50 B print-rounding window for `95.6 kB`. |
| `/blog/[slug]` |             95.4 kB |                    95.4 kB | -15 B | Within Next's ±50 B print-rounding window for `95.4 kB`. |

### mixed

- Version: `Next.js v15.5.28`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`.
- Shared/root representation: Pages Router first-load is `pages['/_app'] ∪ pages[route]`; App Router still repeats shared chunks inside each `app-build-manifest.json.pages` array. Keep the routers separate instead of merging their shared sets.
- Layout finding: As in `app-router`, there's no `/layout` key, every page entry lists the chunk with the root layout's code (`static/chunks/9428cffeaa8092c3.js`), and each prerendered page loads exactly its page entry's chunks plus the polyfills.
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
    "/_app": [
      "static/chunks/47f61d5d24c2b477.js",
      "static/chunks/45ef1499ebb9d969.js",
      "static/chunks/turbopack-a4e90873642d2f0c.js"
    ],
    "/legacy": [
      "static/chunks/37938f535f02f7f5.js",
      "static/chunks/45ef1499ebb9d969.js",
      "static/chunks/turbopack-5d40d5e2d9cbe9d5.js"
    ],
    "/legacy/about": [
      "static/chunks/8d1a69bcfe4fad21.js",
      "static/chunks/45ef1499ebb9d969.js",
      "static/chunks/turbopack-1bffa208a4115abf.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/3e1c7982c34fe58b.js",
      "static/chunks/45ef1499ebb9d969.js",
      "static/chunks/turbopack-c738492d7247811e.js"
    ]
  }
}
```

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/_not-found/page": [
      "static/chunks/9428cffeaa8092c3.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/2de4a43efaf8ad6b.js",
      "static/chunks/8e178bc0b03a8dcc.js",
      "static/chunks/99a256a291dea69c.js",
      "static/chunks/turbopack-646245a19feb0869.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/9428cffeaa8092c3.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/4ab5a1315f193bd2.js",
      "static/chunks/2de4a43efaf8ad6b.js",
      "static/chunks/8e178bc0b03a8dcc.js",
      "static/chunks/99a256a291dea69c.js",
      "static/chunks/turbopack-646245a19feb0869.js"
    ],
    "/page": [
      "static/chunks/9428cffeaa8092c3.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/2de4a43efaf8ad6b.js",
      "static/chunks/8e178bc0b03a8dcc.js",
      "static/chunks/99a256a291dea69c.js",
      "static/chunks/turbopack-646245a19feb0869.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/9428cffeaa8092c3.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/be5d84eeb59cb565.js",
      "static/chunks/2de4a43efaf8ad6b.js",
      "static/chunks/8e178bc0b03a8dcc.js",
      "static/chunks/99a256a291dea69c.js",
      "static/chunks/turbopack-646245a19feb0869.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Computed gzip bytes | `next build` printed value |  Delta | Explanation                                              |
| --------------------- | ------------------: | -------------------------: | -----: | -------------------------------------------------------- |
| `/legacy`             |             93.4 kB |                    93.4 kB |   -6 B | Within Next's ±50 B print-rounding window for `93.4 kB`. |
| `/legacy/about`       |             95.7 kB |                    95.7 kB |   +7 B | Within Next's ±50 B print-rounding window for `95.7 kB`. |
| `/legacy/blog/[slug]` |             95.2 kB |                    95.2 kB |  +25 B | Within Next's ±50 B print-rounding window for `95.2 kB`. |
| `/`                   |            114.1 kB |                     114 kB |  +98 B | Within Next's ±500 B print-rounding window for `114 kB`. |
| `/_not-found`         |            114.1 kB |                     114 kB |  +98 B | Within Next's ±500 B print-rounding window for `114 kB`. |
| `/about`              |            116.1 kB |                     116 kB |  +57 B | Within Next's ±500 B print-rounding window for `116 kB`. |
| `/products/[slug]`    |            115.8 kB |                     116 kB | -194 B | Within Next's ±500 B print-rounding window for `116 kB`. |

### nested-layouts

- Version: `Next.js v15.5.28`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` carries exact App Router route-to-chunk arrays, layouts and boundaries included.
- Manifest finding: The manifest has the seven page keys and nothing else: no `/layout`, `/not-found`, `/global-error`, or any of the blog segment's or the slots' entries that 15-webpack lists. Every page entry already lists the chunks with that code: the root layout's, root `not-found`'s and `global-error`'s code sits in chunks every entry lists, and `/blog/[slug]/page` adds six chunks holding the blog segment's `layout`, `template`, `error`, `loading` and `not-found` and the page itself. Each prerendered page loads exactly its page entry's chunks plus the `nomodule` polyfills, so the 15-webpack union adds nothing here.
- Parallel-route finding: `/dashboard/page`, `/dashboard/@team/page` and `/dashboard/@analytics/page` list the same chunks, which hold every slot's page and `@analytics`' layout, so each slot's row includes its siblings' code and the three rows are equal.
- Route Handler finding: N/A — this fixture has no App Router Route Handler.
- `find .next -maxdepth 2 -type f`: same listing as `app-router`.

**`app-build-manifest.json` excerpt**

```json
{
  "pages": {
    "/page": [
      "static/chunks/44c37dcf1450b1e6.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/e02658ae4ff31906.js",
      "static/chunks/bb9e3712548f83c8.js",
      "static/chunks/31456012ef55b7d2.js",
      "static/chunks/fe6e165de9e05016.js",
      "static/chunks/5d4e467e6c07f371.js",
      "static/chunks/937020354acae76a.js",
      "static/chunks/turbopack-7ddd694f060c8f88.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/44c37dcf1450b1e6.js",
      "static/chunks/93ed5feff6205c84.js",
      "static/chunks/e02658ae4ff31906.js",
      "static/chunks/bb9e3712548f83c8.js",
      "static/chunks/dd1d96c1698ba8da.js",
      "static/chunks/5519ffbdcccdb330.js",
      "static/chunks/9f33e6e06c855d0f.js",
      "static/chunks/ff9eb8f63bc26bb0.js",
      "static/chunks/efb5669c6741448c.js",
      "static/chunks/2cc4e614c4d91853.js",
      "static/chunks/fe6e165de9e05016.js",
      "static/chunks/5d4e467e6c07f371.js",
      "static/chunks/937020354acae76a.js",
      "static/chunks/turbopack-7ddd694f060c8f88.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                   | Computed gzip bytes | `next build` printed value |  Delta | Explanation                                                         |
| ----------------------- | ------------------: | -------------------------: | -----: | ------------------------------------------------------------------- |
| `/`                     |            114.3 kB |                     114 kB | +304 B | Within Next's ±500 B print-rounding window for `114 kB`.            |
| `/_not-found`           |            114.1 kB |                     114 kB |  +56 B | Within Next's ±500 B print-rounding window for `114 kB`.            |
| `/about`                |            114.6 kB |                     115 kB | -416 B | Within Next's ±500 B print-rounding window for `115 kB`.            |
| `/blog/[slug]`          |            115.6 kB |                     116 kB | -358 B | Within Next's ±500 B print-rounding window for `116 kB`.            |
| `/dashboard`            |            115.4 kB |                     115 kB | +376 B | Within Next's ±500 B print-rounding window for `115 kB`.            |
| `/dashboard/@analytics` |            115.4 kB |                        N/A |    N/A | `next build` prints no row for a slot; same chunks as `/dashboard`. |
| `/dashboard/@team`      |            115.4 kB |                        N/A |    N/A | `next build` prints no row for a slot; same chunks as `/dashboard`. |

## 16-webpack

### app-router

- Version: `Next.js v16.4.5`
- Build command: `pnpm exec next build --webpack`
- Verdict: UNSUPPORTED — there is still no reliable App Router manifest that maps route -> client chunk list under Next 16 webpack builds. No `app-build-manifest.json` is generated in this combo.
- Shared/root representation: `build-manifest.json.rootMainFiles` still exposes the shared bootstrap, but `build-manifest.json` has no per-page App Router entries. The only retained route-specific source is `server/app/**/_client-reference-manifest.js`, and those files still do not expose `entryJSFiles`.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` is empty (`clientModules: {}`), so handlers still appear to carry no client JS. The unsupported part is page attribution, not handler detection.
- Why unsupported:
  - `fixtures/next/16-webpack/app-router/.next/server/app/blog/[slug]/page_client-reference-manifest.js` shows the precise leak shape: `app/(marketing)/about/about-client.tsx` is correctly empty there, but `app/_components/home-client.tsx` still carries the root page chunk `static/chunks/app/page-6faf897100a0f05e.js` into `/blog/[slug]`.
  - `fixtures/next/16-webpack/app-router/.next/server/app/(marketing)/about/page_client-reference-manifest.js` shows the mirror image: `app/blog/[slug]/blog-client.tsx` is correctly empty on `/about`, while the same root `app/page` chunk still leaks in through `app/_components/home-client.tsx`. In both files, `entryCSSFiles` includes `/__fixture__/`, `app/layout`, `app/page`, and the route's own page path — the root page entry is present on every page manifest, not just its own.
  - The new prerendered HTML evidence independently shows the manifest is unreliable, not merely noisy: `fixtures/next/16-webpack/app-router/.next/server/app/about.html` loads `/_next/static/chunks/85062f47-16858315c3b1e3c8.js, /_next/static/chunks/626-e341c6c306baaf93.js, /_next/static/chunks/main-app-de87330fe797fb5e.js, /_next/static/chunks/app/layout-050ba86c16ba028f.js, /_next/static/chunks/app/(marketing)/about/page-24a15dfc4b7a8a82.js, /_next/static/chunks/polyfills-42372ed130431b0a.js, /_next/static/chunks/webpack-70c336f9a46f13b1.js`, while `fixtures/next/16-webpack/app-router/.next/server/app/index.html` loads `/_next/static/chunks/85062f47-16858315c3b1e3c8.js, /_next/static/chunks/626-e341c6c306baaf93.js, /_next/static/chunks/main-app-de87330fe797fb5e.js, /_next/static/chunks/app/layout-050ba86c16ba028f.js, /_next/static/chunks/app/page-6faf897100a0f05e.js, /_next/static/chunks/polyfills-42372ed130431b0a.js, /_next/static/chunks/webpack-70c336f9a46f13b1.js`. `/about` does load its own `app/(marketing)/about/page-*.js` chunk, but it does **not** load the root page's `app/page-*.js` chunk even though `/about`'s `page_client-reference-manifest.js` claims that root client component has a non-empty `chunks` array.

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
- `server/preview-props.json`
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
    "static/chunks/85062f47-16858315c3b1e3c8.js",
    "static/chunks/626-e341c6c306baaf93.js",
    "static/chunks/main-app-de87330fe797fb5e.js"
  ],
  "route": "/blog/[slug]/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "app/_components/shared-shell.tsx": ["177", "static/chunks/app/layout-050ba86c16ba028f.js"],
    "app/(marketing)/about/about-client.tsx": [],
    "app/blog/[slug]/blog-client.tsx": [
      "953",
      "static/chunks/app/blog/%5Bslug%5D/page-02a8462ff82dd19d.js"
    ],
    "app/_components/home-client.tsx": ["974", "static/chunks/app/page-6faf897100a0f05e.js"]
  },
  "entryCSSFiles_keys": ["/__fixture__/", "app/layout", "app/page", "app/blog/[slug]/page"]
}
```

**`server/app/(marketing)/about/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/85062f47-16858315c3b1e3c8.js",
    "static/chunks/626-e341c6c306baaf93.js",
    "static/chunks/main-app-de87330fe797fb5e.js"
  ],
  "route": "/(marketing)/about/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "app/_components/shared-shell.tsx": ["177", "static/chunks/app/layout-050ba86c16ba028f.js"],
    "app/(marketing)/about/about-client.tsx": [
      "880",
      "static/chunks/app/(marketing)/about/page-24a15dfc4b7a8a82.js"
    ],
    "app/blog/[slug]/blog-client.tsx": [],
    "app/_components/home-client.tsx": ["974", "static/chunks/app/page-6faf897100a0f05e.js"]
  },
  "entryCSSFiles_keys": ["/__fixture__/", "app/layout", "app/page", "app/(marketing)/about/page"]
}
```

**`server/app/about.html` script list excerpt**

```json
{
  "script_srcs": [
    "/_next/static/chunks/85062f47-16858315c3b1e3c8.js",
    "/_next/static/chunks/626-e341c6c306baaf93.js",
    "/_next/static/chunks/main-app-de87330fe797fb5e.js",
    "/_next/static/chunks/app/layout-050ba86c16ba028f.js",
    "/_next/static/chunks/app/(marketing)/about/page-24a15dfc4b7a8a82.js",
    "/_next/static/chunks/polyfills-42372ed130431b0a.js",
    "/_next/static/chunks/webpack-70c336f9a46f13b1.js"
  ]
}
```

**`server/app/index.html` script list excerpt**

```json
{
  "script_srcs": [
    "/_next/static/chunks/85062f47-16858315c3b1e3c8.js",
    "/_next/static/chunks/626-e341c6c306baaf93.js",
    "/_next/static/chunks/main-app-de87330fe797fb5e.js",
    "/_next/static/chunks/app/layout-050ba86c16ba028f.js",
    "/_next/static/chunks/app/page-6faf897100a0f05e.js",
    "/_next/static/chunks/polyfills-42372ed130431b0a.js",
    "/_next/static/chunks/webpack-70c336f9a46f13b1.js"
  ]
}
```

**Per-route gzip totals vs `next build`**

| Route | Computed gzip bytes | `next build` printed value | Delta | Explanation                                            |
| ----- | ------------------: | -------------------------: | ----: | ------------------------------------------------------ |
| —     |                   — |                          — |     — | No reliable per-route App Router chunk list was found. |

### pages-router

- Version: `Next.js v16.4.5`
- Build command: `pnpm exec next build --webpack`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries the per-route Pages Router entries. Next 16 no longer prints a `First Load JS` column, but the route arrays themselves are still reliable.
- Shared/root representation: `build-manifest.json.pages[route]` omits `build-manifest.json.pages['/_app']`, but `next build` always counts those files. Compute each Pages Router route as `pages['/_app'] ∪ pages[route]`; the `/_app` files are the shared Pages Router core.
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
- `server/preview-props.json`
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
    "/_app": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-24b9e1192bb41b3a.js",
      "static/chunks/main-6e5c698b4b5f6bf9.js",
      "static/chunks/pages/_app-6741ca716e1cb1d3.js"
    ],
    "/": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-24b9e1192bb41b3a.js",
      "static/chunks/main-6e5c698b4b5f6bf9.js",
      "static/chunks/pages/index-f4b1eaa351fc1567.js"
    ],
    "/about": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-24b9e1192bb41b3a.js",
      "static/chunks/main-6e5c698b4b5f6bf9.js",
      "static/chunks/pages/about-0d46c1bd45568a53.js"
    ],
    "/blog/[slug]": [
      "static/chunks/webpack-8b8979e85a85b71d.js",
      "static/chunks/framework-24b9e1192bb41b3a.js",
      "static/chunks/main-6e5c698b4b5f6bf9.js",
      "static/chunks/pages/blog/[slug]-46ed7c3f8f630f59.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Computed gzip bytes | `next build` printed value | Delta | Explanation                               |
| -------------- | ------------------: | -------------------------: | ----: | ----------------------------------------- |
| `/`            |             86.8 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/about`       |             88.5 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/blog/[slug]` |             88.3 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |

### mixed

- Version: `Next.js v16.4.5`
- Build command: `pnpm exec next build --webpack`
- Verdict: SUPPORTED for Pages Router routes — `build-manifest.json.pages` still covers that half, but the App Router half remains unsupported.
- Shared/root representation: Pages Router first-load is `pages['/_app'] ∪ pages[route]`. The App Router half only exposes `build-manifest.json.rootMainFiles` plus ambiguous `server/app/**/_client-reference-manifest.js` files, so keep the routers separate and only compute the Pages Router half here.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` is empty, and because App Router page attribution is still ambiguous, the computed totals below intentionally cover only the Pages Router half.
- Why partially supported: The same structural App Router gap remains here: there is still no `app-build-manifest.json`, `entryJSFiles` is absent, and `fixtures/next/16-webpack/mixed/.next/server/app/products/[slug]/page_client-reference-manifest.js` still lists `app/page` in `entryCSSFiles` alongside `app/layout` and `app/products/[slug]/page`, so there is still no reliable manifest-derived per-route App Router chunk list.

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
- `server/preview-props.json`
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
    "static/chunks/85062f47-16858315c3b1e3c8.js",
    "static/chunks/626-e341c6c306baaf93.js",
    "static/chunks/main-app-ec179116ea4dbe7d.js"
  ],
  "pages": {
    "/_app": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-24b9e1192bb41b3a.js",
      "static/chunks/main-bc44e2e8e3b42ba9.js",
      "static/chunks/pages/_app-4efd84cef24d12c4.js"
    ],
    "/legacy": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-24b9e1192bb41b3a.js",
      "static/chunks/main-bc44e2e8e3b42ba9.js",
      "static/chunks/pages/legacy-7760e89c9acd4ab7.js"
    ],
    "/legacy/about": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-24b9e1192bb41b3a.js",
      "static/chunks/main-bc44e2e8e3b42ba9.js",
      "static/chunks/pages/legacy/about-57047bef58ee0050.js"
    ],
    "/legacy/blog/[slug]": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-24b9e1192bb41b3a.js",
      "static/chunks/main-bc44e2e8e3b42ba9.js",
      "static/chunks/pages/legacy/blog/[slug]-a6a7dec8b62e5f27.js"
    ]
  }
}
```

**`server/app/products/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/85062f47-16858315c3b1e3c8.js",
    "static/chunks/626-e341c6c306baaf93.js",
    "static/chunks/main-app-ec179116ea4dbe7d.js"
  ],
  "route": "/products/[slug]/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "shared/shared-shell.tsx": ["177", "static/chunks/app/layout-32ba3e07a91d8baa.js"],
    "app/(marketing)/about/app-about-client.tsx": [],
    "app/products/[slug]/product-client.tsx": [
      "221",
      "static/chunks/app/products/%5Bslug%5D/page-4fe25ecec485bfcc.js"
    ]
  },
  "entryCSSFiles_keys": ["/__fixture__/", "app/layout", "app/page", "app/products/[slug]/page"]
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Computed gzip bytes | `next build` printed value | Delta | Explanation                               |
| --------------------- | ------------------: | -------------------------: | ----: | ----------------------------------------- |
| `/legacy`             |             87.5 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/legacy/about`       |             89.4 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/legacy/blog/[slug]` |             89.0 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |

## 16-turbopack

### app-router

- Version: `Next.js v16.4.5`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — use `build-manifest.json.rootMainFiles` as the shared bootstrap and each route's `entryJSFiles` from `server/app/**/_client-reference-manifest.js` for per-route additions.
- Shared/root representation: Full App Router first-load JS is `build-manifest.json.rootMainFiles ∪ entryJSFiles[currentRoute]`.
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
- `server/preview-props.json`
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
    "static/chunks/1t8sq563vujq2.js",
    "static/chunks/2n39nacoym5e9.js",
    "static/chunks/2vxuf8-zsb2b4.js",
    "static/chunks/turbopack-2u1d16houkiyo.js"
  ],
  "route": "/blog/[slug]/page",
  "entryJSFiles": {
    "[project]/app/layout": ["static/chunks/3u7dsa2co6wc4.js"],
    "[project]/node_modules/.../builtin/global-error": ["static/chunks/3u7dsa2co6wc4.js"],
    "[project]/app/blog/[slug]/page": [
      "static/chunks/3u7dsa2co6wc4.js",
      "static/chunks/2pze4l8uzky-7.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route            | Computed gzip bytes | `next build` printed value | Delta | Explanation                                                            |
| ---------------- | ------------------: | -------------------------: | ----: | ---------------------------------------------------------------------- |
| `/`              |            135.4 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/_global-error` |            134.6 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/_not-found`    |            135.2 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/about`         |            136.9 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/api/hello`     |                 0 B |                        N/A |   N/A | Empty client-manifest entry; Next 16 prints no `First Load JS` column. |
| `/blog/[slug]`   |            136.7 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |

### pages-router

- Version: `Next.js v16.4.5`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `build-manifest.json.pages` still carries the per-route Pages Router entries. Next 16 no longer prints a `First Load JS` column, but the route arrays themselves are still reliable.
- Shared/root representation: `build-manifest.json.pages[route]` omits `build-manifest.json.pages['/_app']`, but `next build` always counts those files. Compute each Pages Router route as `pages['/_app'] ∪ pages[route]`; the `/_app` files are the shared Pages Router core.
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
- `server/preview-props.json`
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
    "/_app": [
      "static/chunks/2xfzmfdt8xpi7.js",
      "static/chunks/1a2alye4-y9ji.js",
      "static/chunks/turbopack-2u1d16houkiyo.js"
    ],
    "/": ["static/chunks/3q886bo9qhd77.js", "static/chunks/turbopack-2u1d16houkiyo.js"],
    "/about": ["static/chunks/07fe-itv7pkk_.js", "static/chunks/turbopack-2u1d16houkiyo.js"],
    "/blog/[slug]": ["static/chunks/313ea48kp8td4.js", "static/chunks/turbopack-2u1d16houkiyo.js"]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Computed gzip bytes | `next build` printed value | Delta | Explanation                               |
| -------------- | ------------------: | -------------------------: | ----: | ----------------------------------------- |
| `/`            |             88.6 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/about`       |             90.3 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/blog/[slug]` |             90.2 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |

### mixed

- Version: `Next.js v16.4.5`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages['/_app'] ∪ build-manifest.json.pages[route]`, and App Router routes come from `build-manifest.json.rootMainFiles ∪ entryJSFiles`.
- Shared/root representation: Pages Router and App Router expose different shared cores here; keep them separate instead of merging them.
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
- `server/preview-props.json`
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
    "static/chunks/1t8sq563vujq2.js",
    "static/chunks/352l7n3_z55_s.js",
    "static/chunks/3u0anu0j92k65.js",
    "static/chunks/turbopack-2u1d16houkiyo.js"
  ],
  "pages": {
    "/_app": [
      "static/chunks/1174uycr04jp_.js",
      "static/chunks/2warudv3wznj6.js",
      "static/chunks/turbopack-2u1d16houkiyo.js"
    ],
    "/legacy": ["static/chunks/3dq7a4exc_ptq.js", "static/chunks/turbopack-2u1d16houkiyo.js"],
    "/legacy/about": ["static/chunks/0gj--nxmdk9mb.js", "static/chunks/turbopack-2u1d16houkiyo.js"],
    "/legacy/blog/[slug]": [
      "static/chunks/408ol2amvvz0p.js",
      "static/chunks/turbopack-2u1d16houkiyo.js"
    ]
  }
}
```

**`server/app/products/[slug]/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/1t8sq563vujq2.js",
    "static/chunks/352l7n3_z55_s.js",
    "static/chunks/3u0anu0j92k65.js",
    "static/chunks/turbopack-2u1d16houkiyo.js"
  ],
  "route": "/products/[slug]/page",
  "entryJSFiles": {
    "[project]/app/layout": ["static/chunks/0dxe2b8hzmag6.js"],
    "[project]/node_modules/.../builtin/global-error": ["static/chunks/0dxe2b8hzmag6.js"],
    "[project]/app/products/[slug]/page": [
      "static/chunks/0dxe2b8hzmag6.js",
      "static/chunks/08w3h1-k2skcw.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Computed gzip bytes | `next build` printed value | Delta | Explanation                                                            |
| --------------------- | ------------------: | -------------------------: | ----: | ---------------------------------------------------------------------- |
| `/legacy`             |             88.5 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/legacy/about`       |             90.5 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/legacy/blog/[slug]` |             90.0 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/`                   |            135.1 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/_global-error`      |            134.6 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/_not-found`         |            135.1 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/about`              |            137.1 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/api/hello`          |                 0 B |                        N/A |   N/A | Empty client-manifest entry; Next 16 prints no `First Load JS` column. |
| `/products/[slug]`    |            136.8 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |

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
