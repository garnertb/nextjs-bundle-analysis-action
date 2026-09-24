import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readClientReferenceManifest, readJsonManifest, walkFiles } from './manifest-io.js';

describe('readJsonManifest', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-manifest-io-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined when the file does not exist', () => {
    expect(readJsonManifest(dir, 'missing.json')).toBeUndefined();
  });

  it('parses an existing JSON file', () => {
    fs.writeFileSync(
      path.join(dir, 'build-manifest.json'),
      JSON.stringify({ pages: { '/': ['a.js'] } }),
    );
    expect(readJsonManifest(dir, 'build-manifest.json')).toEqual({ pages: { '/': ['a.js'] } });
  });
});

describe('readClientReferenceManifest', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-manifest-io-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('parses a webpack-style assignment with a trailing semicolon', () => {
    const file = path.join(dir, 'page_client-reference-manifest.js');
    fs.writeFileSync(
      file,
      'globalThis.__RSC_MANIFEST["/about/page"] = {"entryJSFiles":{"a":["x.js"]}};',
    );
    const result = readClientReferenceManifest(file);
    expect(result?.key).toBe('/about/page');
    expect(result?.manifest.entryJSFiles).toEqual({ a: ['x.js'] });
  });

  it('parses a 16-webpack-style assignment with a preceding init statement', () => {
    const file = path.join(dir, 'page_client-reference-manifest.js');
    fs.writeFileSync(
      file,
      'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});\n' +
        'globalThis.__RSC_MANIFEST["/about/page"] = {"clientModules":{}};',
    );
    const result = readClientReferenceManifest(file);
    expect(result?.key).toBe('/about/page');
  });

  it('parses a turbopack-style assignment with no trailing semicolon', () => {
    const file = path.join(dir, 'page_client-reference-manifest.js');
    fs.writeFileSync(
      file,
      'globalThis.__RSC_MANIFEST["/about/page"] = {"entryJSFiles":{"a":["y.js"]}}',
    );
    const result = readClientReferenceManifest(file);
    expect(result?.manifest.entryJSFiles).toEqual({ a: ['y.js'] });
  });

  it('returns undefined for content without an RSC_MANIFEST assignment', () => {
    const file = path.join(dir, 'not-a-manifest.js');
    fs.writeFileSync(file, 'console.log("hello");');
    expect(readClientReferenceManifest(file)).toBeUndefined();
  });
});

describe('walkFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-manifest-io-'));
    fs.mkdirSync(path.join(dir, 'nested'));
    fs.writeFileSync(path.join(dir, 'a_client-reference-manifest.js'), '');
    fs.writeFileSync(path.join(dir, 'nested', 'b_client-reference-manifest.js'), '');
    fs.writeFileSync(path.join(dir, 'ignored.txt'), '');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns [] for a directory that does not exist', () => {
    expect(walkFiles(path.join(dir, 'missing'), () => true)).toEqual([]);
  });

  it('recursively finds files matching the predicate', () => {
    const found = walkFiles(dir, (name) => name.endsWith('_client-reference-manifest.js')).sort();
    expect(found).toEqual(
      [
        path.join(dir, 'a_client-reference-manifest.js'),
        path.join(dir, 'nested', 'b_client-reference-manifest.js'),
      ].sort(),
    );
  });
});
