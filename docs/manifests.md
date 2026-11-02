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

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` still carries exact App Router route-to-chunk arrays, once each page's entry is joined with the layout entry above it (see the layout finding).
- Shared/root representation: Shared/root chunks are repeated inside every route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the routes' file sets.
- Layout finding: The root layout has an entry of its own, `/layout`, and no page entry lists its chunk (`static/chunks/app/layout-551d73a218f5e1d1.js`, 634 B gzipped), yet `server/app/index.html`, `about.html` and `_not-found.html` all load it with a `<script>` tag. Each route's first load therefore adds the `/layout` entry. `next build`'s printed value leaves it out: counting it, `/about` and `/blog/[slug]` would print `105 kB`.
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
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-d9a0b0370ce0b51a.js",
      "static/chunks/app/_not-found/page-e137af53785abd90.js"
    ],
    "/layout": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-d9a0b0370ce0b51a.js",
      "static/chunks/app/layout-551d73a218f5e1d1.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-d9a0b0370ce0b51a.js",
      "static/chunks/app/blog/[slug]/page-fb1c70e5aab3b695.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-d9a0b0370ce0b51a.js",
      "static/chunks/app/(marketing)/about/page-d2550a79e55514eb.js"
    ],
    "/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-d9a0b0370ce0b51a.js",
      "static/chunks/app/page-1e8599392dcec9aa.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route          | Computed gzip bytes | `next build` printed value |  Delta | Explanation                                                                                                                              |
| -------------- | ------------------: | -------------------------: | -----: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            |            103.5 kB |                     103 kB | +464 B | Adds the 634 B `/layout` chunk, which `next build` leaves out; the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`. |
| `/_not-found`  |            104.2 kB |                     104 kB | +156 B | Adds the 634 B `/layout` chunk; the page entry alone (103.5 kB) is within the ±500 B window for `104 kB`.                                |
| `/about`       |            105.0 kB |                     104 kB | +981 B | Adds the 634 B `/layout` chunk; the page entry alone (104.3 kB) is within the ±500 B window for `104 kB`.                                |
| `/api/hello`   |            102.7 kB |                     103 kB | -349 B | Within Next's ±500 B print-rounding window for `103 kB`.                                                                                 |
| `/blog/[slug]` |            104.8 kB |                     104 kB | +796 B | Adds the 634 B `/layout` chunk; the page entry alone (104.2 kB) is within the ±500 B window for `104 kB`.                                |

### pages-router

- Version: `Next.js v15.5.25`
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
      "static/chunks/main-a839d92ffbf5ce0c.js",
      "static/chunks/pages/_app-751e98cbae0b42ed.js"
    ],
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

| Route          | Computed gzip bytes | `next build` printed value | Delta | Explanation                                              |
| -------------- | ------------------: | -------------------------: | ----: | -------------------------------------------------------- |
| `/`            |             82.4 kB |                    82.4 kB |  -5 B | Within Next's ±50 B print-rounding window for `82.4 kB`. |
| `/about`       |             84.0 kB |                      84 kB | +28 B | Within Next's ±500 B print-rounding window for `84 kB`.  |
| `/blog/[slug]` |             83.9 kB |                    83.9 kB | +33 B | Within Next's ±50 B print-rounding window for `83.9 kB`. |

### mixed

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`, each page's entry joined with the layout entry above it.
- Shared/root representation: Pages Router first-load is `pages['/_app'] ∪ pages[route]`; App Router still repeats shared chunks inside each `app-build-manifest.json.pages` array. Keep the routers separate instead of merging their shared sets.
- Layout finding: As in `app-router`, the root layout's chunk (`static/chunks/app/layout-ab226076b3d6438a.js`, 625 B gzipped) is only in the `/layout` entry, and `server/app/index.html`, `about.html` and `_not-found.html` all load it. Counting it, `/products/[slug]` would print `105 kB`.
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
      "static/chunks/main-3eeb2d54a3b891d4.js",
      "static/chunks/pages/_app-9ccdb26a9a82a367.js"
    ],
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
      "static/chunks/main-app-6acb934425cee833.js",
      "static/chunks/app/_not-found/page-65dfda04f3977cdf.js"
    ],
    "/layout": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-6acb934425cee833.js",
      "static/chunks/app/layout-ab226076b3d6438a.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-6acb934425cee833.js",
      "static/chunks/app/(marketing)/about/page-7a8a89167cbb1e53.js"
    ],
    "/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-6acb934425cee833.js",
      "static/chunks/app/page-d37c20d0a4164730.js"
    ],
    "/products/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-6acb934425cee833.js",
      "static/chunks/app/products/[slug]/page-892f5c48f0135d6f.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Computed gzip bytes | `next build` printed value |  Delta | Explanation                                                                                                                              |
| --------------------- | ------------------: | -------------------------: | -----: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/legacy`             |             82.9 kB |                    82.9 kB |  -20 B | Within Next's ±50 B print-rounding window for `82.9 kB`.                                                                                 |
| `/legacy/about`       |             84.8 kB |                    84.8 kB |  +22 B | Within Next's ±50 B print-rounding window for `84.8 kB`.                                                                                 |
| `/legacy/blog/[slug]` |             84.4 kB |                    84.4 kB |    0 B | Within Next's ±50 B print-rounding window for `84.4 kB`.                                                                                 |
| `/`                   |            103.3 kB |                     103 kB | +280 B | Adds the 625 B `/layout` chunk, which `next build` leaves out; the page entry alone (102.7 kB) is within the ±500 B window for `103 kB`. |
| `/_not-found`         |            104.1 kB |                     104 kB | +145 B | Adds the 625 B `/layout` chunk; the page entry alone (103.5 kB) is within the ±500 B window for `104 kB`.                                |
| `/about`              |            105.1 kB |                     105 kB | +148 B | Adds the 625 B `/layout` chunk; the page entry alone (104.5 kB) is within the ±500 B window for `105 kB`.                                |
| `/api/hello`          |            102.7 kB |                     103 kB | -345 B | Within Next's ±500 B print-rounding window for `103 kB`.                                                                                 |
| `/products/[slug]`    |            104.9 kB |                     104 kB | +901 B | Adds the 625 B `/layout` chunk; the page entry alone (104.3 kB) is within the ±500 B window for `104 kB`.                                |

### nested-layouts

- Version: `Next.js v15.5.25`
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
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/global-error-a67b4f57d850a896.js"
    ],
    "/layout": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/layout-9ed4f4f09c011803.js"
    ],
    "/not-found": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/not-found-65fc21af31c6f11e.js"
    ],
    "/blog/layout": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/blog/layout-1c2913aeec5ca387.js"
    ],
    "/blog/template": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/blog/template-2418ff659c8494f5.js"
    ],
    "/blog/error": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/blog/error-f408c4c56a8a6d9f.js"
    ],
    "/blog/loading": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/blog/loading-1a1cc5c817c363e2.js"
    ],
    "/blog/not-found": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/blog/not-found-a949009c7adc354a.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/webpack-078f6dfb37dff419.js",
      "static/chunks/4188f269-260947d4cd40a441.js",
      "static/chunks/535-aa5fcf2e65d5bead.js",
      "static/chunks/main-app-a6604c0721203d14.js",
      "static/chunks/app/blog/[slug]/page-19c06cff2a1fac0b.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

The root entries (`/global-error` 337 B, `/layout` 306 B, `/not-found` 290 B gzipped) add 933 B to every route.

| Route                   | Computed gzip bytes | `next build` printed value |    Delta | Explanation                                                                                                                                                    |
| ----------------------- | ------------------: | -------------------------: | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     |            103.7 kB |                     103 kB |   +744 B | Adds the root entries, which `next build` leaves out; the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`.                                |
| `/_not-found`           |            103.6 kB |                     103 kB |   +581 B | Adds the root entries; the page entry alone (102.6 kB) is within the ±500 B window for `103 kB`.                                                               |
| `/about`                |            104.1 kB |                     103 kB | +1,064 B | Adds the root entries and `/(marketing)/layout` (318 B); the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`.                             |
| `/blog/[slug]`          |            105.3 kB |                     103 kB | +2,272 B | Adds the root entries and the blog segment's five (1,510 B); the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`.                         |
| `/dashboard`            |            104.1 kB |                     103 kB | +1,076 B | Adds the root entries and `/dashboard/layout` (329 B); the page entry alone (102.8 kB) is within the ±500 B window for `103 kB`.                               |
| `/dashboard/@analytics` |            104.4 kB |                        N/A |      N/A | `next build` prints no row for a slot (see the parallel-route finding). Adds the root entries, `/dashboard/layout` and `/dashboard/@analytics/layout` (319 B). |
| `/dashboard/@team`      |            104.1 kB |                        N/A |      N/A | `next build` prints no row for a slot. Adds the root entries and `/dashboard/layout`.                                                                          |

## 15-turbopack

### app-router

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — `app-build-manifest.json.pages` still carries exact App Router route-to-chunk arrays.
- Shared/root representation: Shared/root chunks are repeated inside every route array in `app-build-manifest.json.pages`; compute shared JS as the set intersection across the page entries.
- Layout finding: Unlike 15-webpack, the manifest has page keys only, with no `/layout`. Every page entry already lists the chunk with the root layout's client code (`static/chunks/51a33b9b01f841e6.js` holds `SharedShell`), and each prerendered page loads exactly its page entry's chunks plus the `nomodule` polyfills. The layout and boundary union finds no entries to add, so these numbers are the page entries'.
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
    "/(marketing)/about/page": [
      "static/chunks/51a33b9b01f841e6.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/7c66f53201d75c03.js",
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

| Route          | Computed gzip bytes | `next build` printed value |  Delta | Explanation                                              |
| -------------- | ------------------: | -------------------------: | -----: | -------------------------------------------------------- |
| `/`            |            114.2 kB |                     114 kB | +249 B | Within Next's ±500 B print-rounding window for `114 kB`. |
| `/_not-found`  |            114.0 kB |                     114 kB |  -17 B | Within Next's ±500 B print-rounding window for `114 kB`. |
| `/about`       |            115.8 kB |                     116 kB | -235 B | Within Next's ±500 B print-rounding window for `116 kB`. |
| `/blog/[slug]` |            115.6 kB |                     116 kB | -422 B | Within Next's ±500 B print-rounding window for `116 kB`. |

### pages-router

- Version: `Next.js v15.5.25`
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
      "static/chunks/d0dccfd58b1135c8.js",
      "static/chunks/e198ddae1ac5bf45.js",
      "static/chunks/turbopack-c2f5c596d437c1d8.js"
    ],
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

| Route          | Computed gzip bytes | `next build` printed value | Delta | Explanation                                              |
| -------------- | ------------------: | -------------------------: | ----: | -------------------------------------------------------- |
| `/`            |             93.5 kB |                    93.5 kB | -25 B | Within Next's ±50 B print-rounding window for `93.5 kB`. |
| `/about`       |             95.5 kB |                    95.5 kB |  +7 B | Within Next's ±50 B print-rounding window for `95.5 kB`. |
| `/blog/[slug]` |             95.3 kB |                    95.3 kB | -11 B | Within Next's ±50 B print-rounding window for `95.3 kB`. |

### mixed

- Version: `Next.js v15.5.25`
- Build command: `pnpm exec next build --turbopack`
- Verdict: SUPPORTED — Pages Router routes come from `build-manifest.json.pages`; App Router routes come from `app-build-manifest.json.pages`.
- Shared/root representation: Pages Router first-load is `pages['/_app'] ∪ pages[route]`; App Router still repeats shared chunks inside each `app-build-manifest.json.pages` array. Keep the routers separate instead of merging their shared sets.
- Layout finding: As in `app-router`, there's no `/layout` key, every page entry lists the chunk with the root layout's code (`static/chunks/48655ed6c9c9fe09.js`), and each prerendered page loads exactly its page entry's chunks plus the polyfills.
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
      "static/chunks/d409fb7ec1793f8e.js",
      "static/chunks/032fc25b5471a96d.js",
      "static/chunks/turbopack-4ba9fcd6544ae823.js"
    ],
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
    "/_not-found/page": [
      "static/chunks/48655ed6c9c9fe09.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/bd8e7c33d2e5cc46.js",
      "static/chunks/c16f52ae700b9b0c.js",
      "static/chunks/c4ad13ce314e58d1.js",
      "static/chunks/turbopack-efa63d5110fe0380.js"
    ],
    "/(marketing)/about/page": [
      "static/chunks/48655ed6c9c9fe09.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/02d90e606d9b4404.js",
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

| Route                 | Computed gzip bytes | `next build` printed value |  Delta | Explanation                                              |
| --------------------- | ------------------: | -------------------------: | -----: | -------------------------------------------------------- |
| `/legacy`             |             93.3 kB |                    93.3 kB |  -15 B | Within Next's ±50 B print-rounding window for `93.3 kB`. |
| `/legacy/about`       |             95.6 kB |                    95.6 kB |   +2 B | Within Next's ±50 B print-rounding window for `95.6 kB`. |
| `/legacy/blog/[slug]` |             95.1 kB |                    95.1 kB |  +22 B | Within Next's ±50 B print-rounding window for `95.1 kB`. |
| `/`                   |            114.0 kB |                     114 kB |  -25 B | Within Next's ±500 B print-rounding window for `114 kB`. |
| `/_not-found`         |            114.0 kB |                     114 kB |  -25 B | Within Next's ±500 B print-rounding window for `114 kB`. |
| `/about`              |            115.9 kB |                     116 kB |  -67 B | Within Next's ±500 B print-rounding window for `116 kB`. |
| `/products/[slug]`    |            115.7 kB |                     116 kB | -318 B | Within Next's ±500 B print-rounding window for `116 kB`. |

### nested-layouts

- Version: `Next.js v15.5.25`
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
      "static/chunks/55257888a553031c.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/03487153f22fe8e1.js",
      "static/chunks/2bcba88be9affc5a.js",
      "static/chunks/1f2fffe0394d7e7e.js",
      "static/chunks/fadb1a73c271ce26.js",
      "static/chunks/eb961526d82e200c.js",
      "static/chunks/344792388b4cc5c0.js",
      "static/chunks/turbopack-477fa504844b8533.js"
    ],
    "/blog/[slug]/page": [
      "static/chunks/55257888a553031c.js",
      "static/chunks/0e0c64984e756cdd.js",
      "static/chunks/03487153f22fe8e1.js",
      "static/chunks/2bcba88be9affc5a.js",
      "static/chunks/00561c2af9eff98e.js",
      "static/chunks/f412b893327a8755.js",
      "static/chunks/4d6140da02f4502e.js",
      "static/chunks/620b535e7ec8945b.js",
      "static/chunks/b63d4efa6f3070a8.js",
      "static/chunks/ce09ddb7415f0f10.js",
      "static/chunks/fadb1a73c271ce26.js",
      "static/chunks/eb961526d82e200c.js",
      "static/chunks/344792388b4cc5c0.js",
      "static/chunks/turbopack-477fa504844b8533.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                   | Computed gzip bytes | `next build` printed value |  Delta | Explanation                                                         |
| ----------------------- | ------------------: | -------------------------: | -----: | ------------------------------------------------------------------- |
| `/`                     |            114.2 kB |                     114 kB | +162 B | Within Next's ±500 B print-rounding window for `114 kB`.            |
| `/_not-found`           |            113.9 kB |                     114 kB |  -84 B | Within Next's ±500 B print-rounding window for `114 kB`.            |
| `/about`                |            114.4 kB |                     114 kB | +444 B | Within Next's ±500 B print-rounding window for `114 kB`.            |
| `/blog/[slug]`          |            115.5 kB |                     116 kB | -497 B | Within Next's ±500 B print-rounding window for `116 kB`.            |
| `/dashboard`            |            115.2 kB |                     115 kB | +236 B | Within Next's ±500 B print-rounding window for `115 kB`.            |
| `/dashboard/@analytics` |            115.2 kB |                        N/A |    N/A | `next build` prints no row for a slot; same chunks as `/dashboard`. |
| `/dashboard/@team`      |            115.2 kB |                        N/A |    N/A | `next build` prints no row for a slot; same chunks as `/dashboard`. |

## 16-webpack

### app-router

- Version: `Next.js v16.3.5`
- Build command: `pnpm exec next build --webpack`
- Verdict: UNSUPPORTED — there is still no reliable App Router manifest that maps route -> client chunk list under Next 16 webpack builds. No `app-build-manifest.json` is generated in this combo.
- Shared/root representation: `build-manifest.json.rootMainFiles` still exposes the shared bootstrap, but `build-manifest.json` has no per-page App Router entries. The only retained route-specific source is `server/app/**/_client-reference-manifest.js`, and those files still do not expose `entryJSFiles`.
- Route Handler finding: The Route Handler `route_client-reference-manifest.js` is empty (`clientModules: {}`), so handlers still appear to carry no client JS. The unsupported part is page attribution, not handler detection.
- Why unsupported:
  - `fixtures/next/16-webpack/app-router/.next/server/app/blog/[slug]/page_client-reference-manifest.js` shows the precise leak shape: `app/(marketing)/about/about-client.tsx` is correctly empty there, but `app/_components/home-client.tsx` still carries the root page chunk `static/chunks/app/page-e275a0ad40e87fcb.js` into `/blog/[slug]`.
  - `fixtures/next/16-webpack/app-router/.next/server/app/(marketing)/about/page_client-reference-manifest.js` shows the mirror image: `app/blog/[slug]/blog-client.tsx` is correctly empty on `/about`, while the same root `app/page` chunk still leaks in through `app/_components/home-client.tsx`. In both files, `entryCSSFiles` includes `/__fixture__/`, `app/layout`, `app/page`, and the route's own page path — the root page entry is present on every page manifest, not just its own.
  - The new prerendered HTML evidence independently shows the manifest is unreliable, not merely noisy: `fixtures/next/16-webpack/app-router/.next/server/app/about.html` loads `/_next/static/chunks/846cdde3-bbc12c05ca7d2ed5.js, /_next/static/chunks/840-af6eaf733920f9a9.js, /_next/static/chunks/main-app-49649dd7c0625d27.js, /_next/static/chunks/app/layout-cd7e5f128b372de4.js, /_next/static/chunks/app/(marketing)/about/page-e76052639c5e42bd.js, /_next/static/chunks/polyfills-42372ed130431b0a.js, /_next/static/chunks/webpack-70c336f9a46f13b1.js`, while `fixtures/next/16-webpack/app-router/.next/server/app/index.html` loads `/_next/static/chunks/846cdde3-bbc12c05ca7d2ed5.js, /_next/static/chunks/840-af6eaf733920f9a9.js, /_next/static/chunks/main-app-49649dd7c0625d27.js, /_next/static/chunks/app/layout-cd7e5f128b372de4.js, /_next/static/chunks/app/page-e275a0ad40e87fcb.js, /_next/static/chunks/polyfills-42372ed130431b0a.js, /_next/static/chunks/webpack-70c336f9a46f13b1.js`. `/about` does load its own `app/(marketing)/about/page-*.js` chunk, but it does **not** load the root page's `app/page-*.js` chunk even though `/about`'s `page_client-reference-manifest.js` claims that root client component has a non-empty `chunks` array.

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
    "static/chunks/846cdde3-bbc12c05ca7d2ed5.js",
    "static/chunks/840-af6eaf733920f9a9.js",
    "static/chunks/main-app-49649dd7c0625d27.js"
  ],
  "route": "/blog/[slug]/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "app/_components/shared-shell.tsx": ["177", "static/chunks/app/layout-cd7e5f128b372de4.js"],
    "app/(marketing)/about/about-client.tsx": [],
    "app/blog/[slug]/blog-client.tsx": [
      "953",
      "static/chunks/app/blog/%5Bslug%5D/page-9f2d0d2bd0db979d.js"
    ],
    "app/_components/home-client.tsx": ["974", "static/chunks/app/page-e275a0ad40e87fcb.js"]
  },
  "entryCSSFiles_keys": ["/__fixture__/", "app/layout", "app/page", "app/blog/[slug]/page"]
}
```

**`server/app/(marketing)/about/page_client-reference-manifest.js` excerpt**

```json
{
  "build-manifest.rootMainFiles": [
    "static/chunks/webpack-70c336f9a46f13b1.js",
    "static/chunks/846cdde3-bbc12c05ca7d2ed5.js",
    "static/chunks/840-af6eaf733920f9a9.js",
    "static/chunks/main-app-49649dd7c0625d27.js"
  ],
  "route": "/(marketing)/about/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "app/_components/shared-shell.tsx": ["177", "static/chunks/app/layout-cd7e5f128b372de4.js"],
    "app/(marketing)/about/about-client.tsx": [
      "880",
      "static/chunks/app/(marketing)/about/page-e76052639c5e42bd.js"
    ],
    "app/blog/[slug]/blog-client.tsx": [],
    "app/_components/home-client.tsx": ["974", "static/chunks/app/page-e275a0ad40e87fcb.js"]
  },
  "entryCSSFiles_keys": ["/__fixture__/", "app/layout", "app/page", "app/(marketing)/about/page"]
}
```

**`server/app/about.html` script list excerpt**

```json
{
  "script_srcs": [
    "/_next/static/chunks/846cdde3-bbc12c05ca7d2ed5.js",
    "/_next/static/chunks/840-af6eaf733920f9a9.js",
    "/_next/static/chunks/main-app-49649dd7c0625d27.js",
    "/_next/static/chunks/app/layout-cd7e5f128b372de4.js",
    "/_next/static/chunks/app/(marketing)/about/page-e76052639c5e42bd.js",
    "/_next/static/chunks/polyfills-42372ed130431b0a.js",
    "/_next/static/chunks/webpack-70c336f9a46f13b1.js"
  ]
}
```

**`server/app/index.html` script list excerpt**

```json
{
  "script_srcs": [
    "/_next/static/chunks/846cdde3-bbc12c05ca7d2ed5.js",
    "/_next/static/chunks/840-af6eaf733920f9a9.js",
    "/_next/static/chunks/main-app-49649dd7c0625d27.js",
    "/_next/static/chunks/app/layout-cd7e5f128b372de4.js",
    "/_next/static/chunks/app/page-e275a0ad40e87fcb.js",
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

- Version: `Next.js v16.3.5`
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
      "static/chunks/framework-147d2e36b83bcf32.js",
      "static/chunks/main-960ccc25d30c261b.js",
      "static/chunks/pages/_app-97183e60c4fe2493.js"
    ],
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

| Route          | Computed gzip bytes | `next build` printed value | Delta | Explanation                               |
| -------------- | ------------------: | -------------------------: | ----: | ----------------------------------------- |
| `/`            |             86.5 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/about`       |             88.1 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/blog/[slug]` |             88.0 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |

### mixed

- Version: `Next.js v16.3.5`
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
    "static/chunks/846cdde3-bbc12c05ca7d2ed5.js",
    "static/chunks/840-af6eaf733920f9a9.js",
    "static/chunks/main-app-f96613bf9d5ebfa7.js"
  ],
  "pages": {
    "/_app": [
      "static/chunks/webpack-70c336f9a46f13b1.js",
      "static/chunks/framework-147d2e36b83bcf32.js",
      "static/chunks/main-a4abc6004529b25c.js",
      "static/chunks/pages/_app-eb59119d245f26d1.js"
    ],
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
    "static/chunks/main-app-f96613bf9d5ebfa7.js"
  ],
  "route": "/products/[slug]/page",
  "entryJSFiles": "<absent>",
  "clientModules_subset": {
    "shared/shared-shell.tsx": ["177", "static/chunks/app/layout-a284bc830340e254.js"],
    "app/(marketing)/about/app-about-client.tsx": [],
    "app/products/[slug]/product-client.tsx": [
      "221",
      "static/chunks/app/products/%5Bslug%5D/page-f04882c2a17d15c5.js"
    ]
  },
  "entryCSSFiles_keys": ["/__fixture__/", "app/layout", "app/page", "app/products/[slug]/page"]
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Computed gzip bytes | `next build` printed value | Delta | Explanation                               |
| --------------------- | ------------------: | -------------------------: | ----: | ----------------------------------------- |
| `/legacy`             |             86.9 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/legacy/about`       |             88.8 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/legacy/blog/[slug]` |             88.4 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |

## 16-turbopack

### app-router

- Version: `Next.js v16.3.5`
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
    "static/chunks/3s5pmkd2ir1yc.js",
    "static/chunks/0bkymafeh5y29.js",
    "static/chunks/3gzbjf3balqow.js",
    "static/chunks/turbopack-2eugc5apgy_de.js"
  ],
  "route": "/blog/[slug]/page",
  "entryJSFiles": {
    "[project]/app/layout": ["static/chunks/40jnpcxq3aokl.js"],
    "[project]/node_modules/.../builtin/global-error": ["static/chunks/40jnpcxq3aokl.js"],
    "[project]/app/blog/[slug]/page": [
      "static/chunks/40jnpcxq3aokl.js",
      "static/chunks/2i-kqpde7pdef.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route            | Computed gzip bytes | `next build` printed value | Delta | Explanation                                                            |
| ---------------- | ------------------: | -------------------------: | ----: | ---------------------------------------------------------------------- |
| `/`              |            133.9 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/_global-error` |            133.1 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/_not-found`    |            133.6 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/about`         |            135.4 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/api/hello`     |                 0 B |                        N/A |   N/A | Empty client-manifest entry; Next 16 prints no `First Load JS` column. |
| `/blog/[slug]`   |            135.2 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |

### pages-router

- Version: `Next.js v16.3.5`
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
      "static/chunks/0n9xg-ov62bj8.js",
      "static/chunks/21z7_s-9x_wfn.js",
      "static/chunks/turbopack-17hbxysvgok4y.js"
    ],
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

| Route          | Computed gzip bytes | `next build` printed value | Delta | Explanation                               |
| -------------- | ------------------: | -------------------------: | ----: | ----------------------------------------- |
| `/`            |             96.8 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/about`       |             98.8 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |
| `/blog/[slug]` |             98.6 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column. |

### mixed

- Version: `Next.js v16.3.5`
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
    "static/chunks/3s5pmkd2ir1yc.js",
    "static/chunks/0bkymafeh5y29.js",
    "static/chunks/3gzbjf3balqow.js",
    "static/chunks/turbopack-2eugc5apgy_de.js"
  ],
  "pages": {
    "/_app": [
      "static/chunks/1u7d3g9ui9k6u.js",
      "static/chunks/2swr6i7d99d2a.js",
      "static/chunks/turbopack-2uew38sfeoq-_.js"
    ],
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
    "[project]/node_modules/.../builtin/global-error": ["static/chunks/0lpk04d97l_im.js"],
    "[project]/app/products/[slug]/page": [
      "static/chunks/0lpk04d97l_im.js",
      "static/chunks/00v2okdo1-jt-.js"
    ]
  }
}
```

**Per-route gzip totals vs `next build`**

| Route                 | Computed gzip bytes | `next build` printed value | Delta | Explanation                                                            |
| --------------------- | ------------------: | -------------------------: | ----: | ---------------------------------------------------------------------- |
| `/legacy`             |             96.7 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/legacy/about`       |             99.0 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/legacy/blog/[slug]` |             98.5 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/`                   |            133.6 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/_global-error`      |            133.1 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/_not-found`         |            133.6 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/about`              |            135.6 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |
| `/api/hello`          |                 0 B |                        N/A |   N/A | Empty client-manifest entry; Next 16 prints no `First Load JS` column. |
| `/products/[slug]`    |            135.3 kB |                        N/A |   N/A | Next 16 prints no `First Load JS` column.                              |

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
