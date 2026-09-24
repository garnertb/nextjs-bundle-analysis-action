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
const modulePathCommentPattern = /^\/\/ (.+\.(?:m|c)?[jt]s)$/;
const modulePathKeyPattern =
  /"([^"]+\/node_modules\/[^"]+\.(?:m|c)?[jt]s)"(\(exports(?:, module)?\))/g;

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

writeFileSync(output.path, sanitized);
