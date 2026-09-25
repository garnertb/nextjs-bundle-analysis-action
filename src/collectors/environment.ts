import fs from 'node:fs';
import path from 'node:path';

/**
 * Best-effort metadata for the report footer. If these can't be determined
 * (e.g. against a trimmed test fixture that doesn't retain these files), the
 * report simply omits them. A resolved Next version below
 * {@link MIN_SUPPORTED_NEXT_MAJOR} is rejected by `collectBundleReport`; an
 * unresolvable one never gates collection.
 */
export function detectBundler(nextDir: string): string | undefined {
  if (fs.existsSync(path.join(nextDir, 'turbopack'))) return 'turbopack';
  if (fs.existsSync(path.join(nextDir, 'server', 'webpack-runtime.js'))) return 'webpack';
  return undefined;
}

function readNextVersionAt(directory: string): string | undefined {
  const packageJsonPath = path.join(directory, 'node_modules', 'next', 'package.json');
  if (!fs.existsSync(packageJsonPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the installed `next` version the way Node would from `appDirectory`: the
 * closest `node_modules/next` walking up through ancestors, so hoisted monorepo installs
 * and pnpm symlinks both resolve. `fallbackDirectory` is only consulted if that walk finds
 * nothing.
 */
export function detectNextVersion(
  appDirectory: string,
  fallbackDirectory?: string,
): string | undefined {
  let current = path.resolve(appDirectory);
  for (;;) {
    const version = readNextVersionAt(current);
    if (version !== undefined) return version;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return fallbackDirectory === undefined ? undefined : readNextVersionAt(fallbackDirectory);
}

export const MIN_SUPPORTED_NEXT_MAJOR = 15;

/** `undefined` when the version is unknown or its major can't be parsed. */
export function isSupportedNextVersion(version: string | undefined): boolean | undefined {
  const match = version === undefined ? null : /^v?(\d+)\./.exec(version.trim());
  if (!match) return undefined;
  return Number(match[1]) >= MIN_SUPPORTED_NEXT_MAJOR;
}
