import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { collectAppManifestRoutes } from './app-manifest.js';
import { RouteCollisionError } from './route-path.js';

describe('collectAppManifestRoutes', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-app-manifest-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeAppBuildManifest(pages: Record<string, string[]>) {
    fs.writeFileSync(path.join(dir, 'app-build-manifest.json'), JSON.stringify({ pages }));
  }

  it('returns undefined when app-build-manifest.json is missing', () => {
    expect(collectAppManifestRoutes(dir)).toBeUndefined();
  });

  it('returns undefined for an empty pages object (no App Router in this build)', () => {
    writeAppBuildManifest({});
    expect(collectAppManifestRoutes(dir)).toBeUndefined();
  });

  it('normalizes route-group keys and excludes Route Handlers', () => {
    writeAppBuildManifest({
      '/(marketing)/about/page': ['about.js'],
      '/api/hello/route': ['hello.js'],
    });
    const routes = collectAppManifestRoutes(dir);
    expect(Array.from(routes?.keys() ?? [])).toEqual(['/about']);
  });

  it('throws RouteCollisionError when two keys normalize to the same route', () => {
    writeAppBuildManifest({
      '/(marketing)/about/page': ['a.js'],
      '/(shop)/about/page': ['b.js'],
    });
    expect(() => collectAppManifestRoutes(dir)).toThrow(RouteCollisionError);
  });
});
