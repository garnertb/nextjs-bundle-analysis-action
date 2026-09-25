import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectAppRoutes } from './detect.js';
import { UnsupportedAppRouterError } from './unsupported-error.js';

describe('collectAppRoutes', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-detect-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined when there is no App Router (empty rootMainFiles, no app-build-manifest.json)', () => {
    fs.writeFileSync(path.join(dir, 'build-manifest.json'), JSON.stringify({ rootMainFiles: [] }));
    expect(collectAppRoutes(dir)).toBeUndefined();
  });

  it('returns undefined when build-manifest.json itself is missing', () => {
    expect(collectAppRoutes(dir)).toBeUndefined();
  });

  it('prefers app-build-manifest.json (webpack/15-turbopack shape) when present', () => {
    fs.writeFileSync(
      path.join(dir, 'app-build-manifest.json'),
      JSON.stringify({ pages: { '/about/page': ['about.js'] } }),
    );
    const routes = collectAppRoutes(dir);
    expect(Array.from(routes?.keys() ?? [])).toEqual(['/about']);
  });

  it('falls back to the Turbopack client-reference-manifest shape', () => {
    fs.writeFileSync(
      path.join(dir, 'build-manifest.json'),
      JSON.stringify({ rootMainFiles: ['root.js'] }),
    );
    const manifestDir = path.join(dir, 'server', 'app', 'about');
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir, 'page_client-reference-manifest.js'),
      'globalThis.__RSC_MANIFEST["/about/page"] = {"entryJSFiles":{"page":["about.js"]}};',
    );
    const routes = collectAppRoutes(dir);
    expect(routes?.get('/about')?.sort()).toEqual(['about.js', 'root.js']);
  });

  it('throws UnsupportedAppRouterError when rootMainFiles is non-empty but no manifest exposes entryJSFiles', () => {
    fs.writeFileSync(
      path.join(dir, 'build-manifest.json'),
      JSON.stringify({ rootMainFiles: ['root.js'] }),
    );
    const manifestDir = path.join(dir, 'server', 'app', 'about');
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir, 'page_client-reference-manifest.js'),
      'globalThis.__RSC_MANIFEST["/about/page"] = {"clientModules":{}};',
    );
    expect(() => collectAppRoutes(dir)).toThrow(UnsupportedAppRouterError);
  });
});
