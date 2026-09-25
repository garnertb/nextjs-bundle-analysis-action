import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectPagesRoutes } from './pages.js';

describe('collectPagesRoutes', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-pages-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeBuildManifest(pages: Record<string, string[]>) {
    fs.writeFileSync(path.join(dir, 'build-manifest.json'), JSON.stringify({ pages }));
  }

  it('unions /_app files into every route and excludes /_app itself', () => {
    writeBuildManifest({
      '/_app': ['app.js'],
      '/about': ['about.js'],
    });
    const routes = collectPagesRoutes(dir);
    expect(routes?.has('/_app')).toBe(false);
    expect(routes?.get('/about')?.sort()).toEqual(['about.js', 'app.js']);
  });

  it('excludes /_error and /_document as routes', () => {
    writeBuildManifest({
      '/_app': [],
      '/_error': ['error.js'],
      '/_document': ['document.js'],
      '/about': ['about.js'],
    });
    const routes = collectPagesRoutes(dir);
    expect(Array.from(routes?.keys() ?? [])).toEqual(['/about']);
  });

  it('returns undefined when build-manifest.json is missing', () => {
    expect(collectPagesRoutes(dir)).toBeUndefined();
  });

  it('returns undefined when pages has no routes beyond the excluded ones', () => {
    writeBuildManifest({ '/_app': [] });
    expect(collectPagesRoutes(dir)).toBeUndefined();
  });

  it('handles a missing /_app entry as an empty file set', () => {
    writeBuildManifest({ '/about': ['about.js'] });
    expect(collectPagesRoutes(dir)?.get('/about')).toEqual(['about.js']);
  });
});
