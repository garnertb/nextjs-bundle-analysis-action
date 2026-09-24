import path from 'node:path';
import { readClientReferenceManifest, walkFiles } from './manifest-io.js';
import { normalizeManifestKey, RouteCollisionError } from './route-path.js';

/**
 * Next 16 Turbopack App Router first-load JS is
 * `build-manifest.json.rootMainFiles ∪ entryJSFiles[*]` for that route's
 * `server/app/**\/*_client-reference-manifest.js` file: `entryJSFiles` maps
 * several module ids (the route's layout(s), the built-in global-error
 * boundary, the page itself) to chunk arrays, so the route's own files are
 * the union of every value, not a single lookup.
 *
 * Returns `undefined` if no client-reference-manifest exposes `entryJSFiles`
 * at all (the Next 16 webpack shape), signaling the caller to treat this
 * build as unsupported rather than guessing.
 */
export function collectAppTurbopackRoutes(
  nextDir: string,
  rootMainFiles: readonly string[],
): Map<string, string[]> | undefined {
  const manifestFiles = walkFiles(path.join(nextDir, 'server', 'app'), (fileName) =>
    fileName.endsWith('_client-reference-manifest.js'),
  );
  const routes = new Map<string, string[]>();
  const collisionKeys = new Map<string, string>();
  let sawEntryJSFiles = false;

  for (const file of manifestFiles) {
    const parsed = readClientReferenceManifest(file);
    if (!parsed) continue;
    const normalized = normalizeManifestKey(parsed.key);
    if (!normalized || normalized.kind !== 'page') continue; // drop Route Handlers
    if (!parsed.manifest.entryJSFiles) continue;
    sawEntryJSFiles = true;
    const ownFiles = new Set(Object.values(parsed.manifest.entryJSFiles).flat());
    const files = new Set([...rootMainFiles, ...ownFiles]);
    const existingKey = collisionKeys.get(normalized.route);
    if (existingKey) {
      throw new RouteCollisionError(normalized.route, existingKey, parsed.key);
    }
    collisionKeys.set(normalized.route, parsed.key);
    routes.set(normalized.route, Array.from(files));
  }

  return sawEntryJSFiles ? routes : undefined;
}
