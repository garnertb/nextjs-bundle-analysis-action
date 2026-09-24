import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';

// esbuild embeds each bundled module's on-disk install path both as a
// `// <path>` comment and as the CommonJS wrapper's object key (used for
// stack traces). With pnpm's global virtual store, that path varies by
// machine even for an identical lockfile, which would make dist/index.js
// non-reproducible. Normalize both forms post-build to the path segment
// starting at the last `node_modules/`, which is stable across install
// layouts, so the committed output doesn't depend on where packages
// happen to be installed.
const modulePathCommentPattern = /^\/\/ (.+\.(?:m|c)?[jt]s|.+\.json)$/;
const modulePathKeyPattern =
  /"([^"]+\/node_modules\/[^"]+\.(?:(?:m|c)?[jt]s|json))"(\(exports\d*(?:, module\d*)?\))/g;

function normalizeModulePath(fullPath) {
  const marker = 'node_modules/';
  const lastIndex = fullPath.lastIndexOf(marker);
  return lastIndex === -1 ? fullPath : fullPath.slice(lastIndex);
}

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  outfile: 'dist/index.js',
  format: 'esm',
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  sourcemap: false,
  minify: false,
  write: false,
});

const [output] = result.outputFiles;
const sanitized = output.text
  .split('\n')
  .map((line) => {
    const match = line.match(modulePathCommentPattern);
    return match ? `// ${normalizeModulePath(match[1])}` : line;
  })
  .join('\n')
  .replace(
    modulePathKeyPattern,
    (_full, path, suffix) => `"${normalizeModulePath(path)}"${suffix}`,
  );

// A regression here would silently reintroduce a machine-dependent dist/;
// catch it immediately rather than only when check-dist next runs in CI.
const home = process.env['HOME'];
if (
  sanitized.includes('/Users/') ||
  sanitized.includes('/home/') ||
  (home && sanitized.includes(home))
) {
  throw new Error(
    'dist/index.js still contains an absolute filesystem path after sanitization; ' +
      'the module-path normalization in esbuild.config.mjs needs updating for a new esbuild wrapper shape.',
  );
}

writeFileSync(output.path, sanitized);
