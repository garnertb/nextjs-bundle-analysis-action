import { describe, expect, it } from 'vitest';
import {
  buildRouteFileMap,
  disambiguateAcrossRouters,
  normalizeManifestKey,
  RouteCollisionError,
} from './route-path.js';

describe('normalizeManifestKey', () => {
  it('normalizes the root page key', () => {
    expect(normalizeManifestKey('/page')).toEqual({ route: '/', kind: 'page' });
  });

  it('drops route-group segments', () => {
    expect(normalizeManifestKey('/(marketing)/about/page')).toEqual({
      route: '/about',
      kind: 'page',
    });
  });

  it('drops multiple route groups anywhere in the path', () => {
    expect(normalizeManifestKey('/(marketing)/blog/(details)/[slug]/page')).toEqual({
      route: '/blog/[slug]',
      kind: 'page',
    });
  });

  it('keeps parallel-route slot segments', () => {
    expect(normalizeManifestKey('/dashboard/@analytics/page')).toEqual({
      route: '/dashboard/@analytics',
      kind: 'page',
    });
  });

  it('keeps single-dot intercepting-route markers', () => {
    expect(normalizeManifestKey('/feed/(.)photo/[id]/page')).toEqual({
      route: '/feed/(.)photo/[id]',
      kind: 'page',
    });
  });

  it('keeps double-dot intercepting-route markers', () => {
    expect(normalizeManifestKey('/feed/(..)photo/[id]/page')).toEqual({
      route: '/feed/(..)photo/[id]',
      kind: 'page',
    });
  });

  it('keeps triple-dot intercepting-route markers', () => {
    expect(normalizeManifestKey('/feed/(...)photo/[id]/page')).toEqual({
      route: '/feed/(...)photo/[id]',
      kind: 'page',
    });
  });

  it('classifies Route Handlers by their /route suffix', () => {
    expect(normalizeManifestKey('/api/hello/route')).toEqual({
      route: '/api/hello',
      kind: 'route',
    });
  });

  it('returns undefined for keys without a page/route suffix', () => {
    expect(normalizeManifestKey('/layout')).toBeUndefined();
  });
});

describe('buildRouteFileMap', () => {
  it('throws RouteCollisionError when two keys normalize to the same route', () => {
    const entries: [string, string[]][] = [
      ['/(marketing)/about/page', ['a.js']],
      ['/(shop)/about/page', ['b.js']],
    ];
    expect(() => buildRouteFileMap(entries, { includeRoute: true, includePage: true })).toThrow(
      RouteCollisionError,
    );
  });

  it('excludes Route Handlers when includeRoute is false', () => {
    const entries: [string, string[]][] = [
      ['/about/page', ['a.js']],
      ['/api/hello/route', ['b.js']],
    ];
    const result = buildRouteFileMap(entries, { includeRoute: false, includePage: true });
    expect(Array.from(result.keys())).toEqual(['/about']);
  });

  it('excludes pages when includePage is false', () => {
    const entries: [string, string[]][] = [
      ['/about/page', ['a.js']],
      ['/api/hello/route', ['b.js']],
    ];
    const result = buildRouteFileMap(entries, { includeRoute: true, includePage: false });
    expect(Array.from(result.keys())).toEqual(['/api/hello']);
  });

  it('deduplicates repeated files for a route', () => {
    const entries: [string, string[]][] = [['/about/page', ['a.js', 'a.js', 'b.js']]];
    const result = buildRouteFileMap(entries, { includeRoute: true, includePage: true });
    expect(result.get('/about')).toEqual(['a.js', 'b.js']);
  });
});

describe('disambiguateAcrossRouters', () => {
  it('leaves routes untouched when there is no overlap', () => {
    const pages = new Map([['/legacy', ['a.js']]]);
    const app = new Map([['/about', ['b.js']]]);
    const result = disambiguateAcrossRouters(pages, app);
    expect(Array.from(result.pages!.keys())).toEqual(['/legacy']);
    expect(Array.from(result.app!.keys())).toEqual(['/about']);
  });

  it('suffixes colliding routes with their router', () => {
    const pages = new Map([
      ['/about', ['a.js']],
      ['/legacy', ['c.js']],
    ]);
    const app = new Map([
      ['/about', ['b.js']],
      ['/blog', ['d.js']],
    ]);
    const result = disambiguateAcrossRouters(pages, app);
    expect(Array.from(result.pages!.keys())).toEqual(['/about (pages)', '/legacy']);
    expect(Array.from(result.app!.keys())).toEqual(['/about (app)', '/blog']);
  });

  it('passes through unchanged when one router is absent', () => {
    const pages = new Map([['/about', ['a.js']]]);
    const result = disambiguateAcrossRouters(pages, undefined);
    expect(result.app).toBeUndefined();
    expect(result.pages).toBe(pages);
  });
});
