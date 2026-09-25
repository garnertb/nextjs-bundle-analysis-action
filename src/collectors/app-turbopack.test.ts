import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectAppTurbopackRoutes } from './app-turbopack.js';
import { RouteCollisionError } from './route-path.js';

describe('collectAppTurbopackRoutes', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-app-turbopack-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeManifest(relativeDir: string, fileName: string, key: string, body: string) {
    const full = path.join(dir, 'server', 'app', relativeDir);
    fs.mkdirSync(full, { recursive: true });
    fs.writeFileSync(path.join(full, fileName), `globalThis.__RSC_MANIFEST["${key}"] = ${body};`);
  }

  it('unions entryJSFiles values with rootMainFiles for each route', () => {
    writeManifest(
      'about',
      'page_client-reference-manifest.js',
      '/about/page',
      JSON.stringify({ entryJSFiles: { layout: ['layout.js'], page: ['about.js'] } }),
    );
    const routes = collectAppTurbopackRoutes(dir, ['root.js']);
    expect(routes?.get('/about')?.sort()).toEqual(['about.js', 'layout.js', 'root.js']);
  });

  it('drops Route Handler manifests', () => {
    writeManifest(
      'api/hello',
      'route_client-reference-manifest.js',
      '/api/hello/route',
      JSON.stringify({ entryJSFiles: { route: ['hello.js'] } }),
    );
    const routes = collectAppTurbopackRoutes(dir, []);
    expect(routes?.size ?? 0).toBe(0);
  });

  it('returns undefined when no manifest exposes entryJSFiles (16-webpack shape)', () => {
    writeManifest(
      'about',
      'page_client-reference-manifest.js',
      '/about/page',
      JSON.stringify({ clientModules: {} }),
    );
    expect(collectAppTurbopackRoutes(dir, ['root.js'])).toBeUndefined();
  });

  it('throws RouteCollisionError when two manifest keys normalize to the same route', () => {
    writeManifest(
      '(marketing)/about',
      'page_client-reference-manifest.js',
      '/(marketing)/about/page',
      JSON.stringify({ entryJSFiles: { page: ['a.js'] } }),
    );
    writeManifest(
      '(shop)/about',
      'page_client-reference-manifest.js',
      '/(shop)/about/page',
      JSON.stringify({ entryJSFiles: { page: ['b.js'] } }),
    );
    expect(() => collectAppTurbopackRoutes(dir, [])).toThrow(RouteCollisionError);
  });
});
