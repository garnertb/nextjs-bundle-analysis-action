import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  it('adds the layouts and boundaries of every segment above a page (Next 15 webpack shape)', () => {
    writeAppBuildManifest({
      '/global-error': ['main.js', 'global-error.js'],
      '/layout': ['main.js', 'layout.js'],
      '/not-found': ['main.js', 'not-found.js'],
      '/page': ['main.js', 'page.js'],
      '/(marketing)/layout': ['main.js', 'marketing-layout.js'],
      '/(marketing)/about/page': ['main.js', 'about.js'],
      '/blog/layout': ['main.js', 'blog-layout.js'],
      '/blog/template': ['main.js', 'blog-template.js'],
      '/blog/error': ['main.js', 'blog-error.js'],
      '/blog/loading': ['main.js', 'blog-loading.js'],
      '/blog/not-found': ['main.js', 'blog-not-found.js'],
      '/blog/page': ['main.js', 'blog.js'],
      '/blog/[slug]/layout': ['main.js', 'post-layout.js'],
      '/blog/[slug]/page': ['main.js', 'post.js'],
      '/api/hello/route': ['main.js', 'hello.js'],
    });
    const routes = collectAppManifestRoutes(dir);
    const root = ['main.js', 'global-error.js', 'layout.js', 'not-found.js'];
    const blog = [
      'blog-layout.js',
      'blog-template.js',
      'blog-error.js',
      'blog-loading.js',
      'blog-not-found.js',
    ];
    expect(Object.fromEntries(routes ?? [])).toEqual({
      '/': [...root, 'page.js'],
      '/about': [...root, 'marketing-layout.js', 'about.js'],
      '/blog': [...root, ...blog, 'blog.js'],
      '/blog/[slug]': [...root, ...blog, 'post-layout.js', 'post.js'],
    });
  });

  it("keeps parallel-route slots as their own routes, without siblings' entries or slot defaults", () => {
    writeAppBuildManifest({
      '/layout': ['layout.js'],
      '/dashboard/layout': ['dashboard-layout.js'],
      '/dashboard/page': ['dashboard.js'],
      '/dashboard/@team/default': ['team-default.js'],
      '/dashboard/@team/page': ['team.js'],
      '/dashboard/@analytics/layout': ['analytics-layout.js'],
      '/dashboard/@analytics/page': ['analytics.js'],
    });
    expect(Object.fromEntries(collectAppManifestRoutes(dir) ?? [])).toEqual({
      '/dashboard': ['layout.js', 'dashboard-layout.js', 'dashboard.js'],
      '/dashboard/@team': ['layout.js', 'dashboard-layout.js', 'team.js'],
      '/dashboard/@analytics': [
        'layout.js',
        'dashboard-layout.js',
        'analytics-layout.js',
        'analytics.js',
      ],
    });
  });

  it("adds an intercepting route's enclosing layouts under its own route", () => {
    writeAppBuildManifest({
      '/layout': ['layout.js'],
      '/feed/layout': ['feed-layout.js'],
      '/feed/(..)photo/[id]/page': ['modal.js'],
      '/photo/[id]/page': ['photo.js'],
    });
    expect(Object.fromEntries(collectAppManifestRoutes(dir) ?? [])).toEqual({
      '/feed/(..)photo/[id]': ['layout.js', 'feed-layout.js', 'modal.js'],
      '/photo/[id]': ['layout.js', 'photo.js'],
    });
  });

  it('leaves page entries unchanged when the manifest lists no layouts (Next 15 Turbopack shape)', () => {
    writeAppBuildManifest({
      '/page': ['runtime.js', 'shell.js', 'home.js'],
      '/blog/[slug]/page': ['runtime.js', 'shell.js', 'post.js'],
    });
    expect(Object.fromEntries(collectAppManifestRoutes(dir) ?? [])).toEqual({
      '/': ['runtime.js', 'shell.js', 'home.js'],
      '/blog/[slug]': ['runtime.js', 'shell.js', 'post.js'],
    });
  });
});
