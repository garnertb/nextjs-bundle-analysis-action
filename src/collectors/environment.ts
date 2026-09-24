import fs from 'node:fs';
import path from 'node:path';

/**
 * Best-effort metadata for the report footer. Never gates collection: if
 * these can't be determined (e.g. against a trimmed test fixture that
 * doesn't retain these files), the report simply omits them.
 */
export function detectBundler(nextDir: string): string | undefined {
  if (fs.existsSync(path.join(nextDir, 'turbopack'))) return 'turbopack';
  if (fs.existsSync(path.join(nextDir, 'server', 'webpack-runtime.js'))) return 'webpack';
  return undefined;
}

export function detectNextVersion(workingDirectory: string): string | undefined {
  const packageJsonPath = path.join(workingDirectory, 'node_modules', 'next', 'package.json');
  if (!fs.existsSync(packageJsonPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}
