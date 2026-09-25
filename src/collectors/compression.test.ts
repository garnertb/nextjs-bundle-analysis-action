import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compressedSize, FileSizeCache } from './compression.js';

describe('compressedSize', () => {
  const content = Buffer.from('x'.repeat(1000), 'utf8');

  it('gzip is smaller than the raw buffer for compressible content', () => {
    expect(compressedSize(content, 'gzip')).toBeLessThan(content.byteLength);
  });

  it('brotli is smaller than the raw buffer for compressible content', () => {
    expect(compressedSize(content, 'brotli')).toBeLessThan(content.byteLength);
  });

  it('none returns the raw buffer length', () => {
    expect(compressedSize(content, 'none')).toBe(content.byteLength);
  });
});

describe('FileSizeCache', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-collectors-'));
    fs.writeFileSync(path.join(dir, 'a.js'), 'a'.repeat(1000));
    fs.writeFileSync(path.join(dir, 'b.js'), 'b'.repeat(1000));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sums sizes across a file set', () => {
    const cache = new FileSizeCache(dir, 'none');
    expect(cache.sizeOfSet(['a.js', 'b.js'])).toBe(2000);
  });

  it('caches repeated lookups of the same file', () => {
    const cache = new FileSizeCache(dir, 'none');
    expect(cache.sizeOf('a.js')).toBe(1000);
    fs.writeFileSync(path.join(dir, 'a.js'), 'changed after first read');
    expect(cache.sizeOf('a.js')).toBe(1000);
  });

  it('throws a descriptive error for a missing referenced chunk', () => {
    const cache = new FileSizeCache(dir, 'none');
    expect(() => cache.sizeOf('missing.js')).toThrow(
      /Referenced chunk "missing\.js" does not exist/,
    );
  });
});
