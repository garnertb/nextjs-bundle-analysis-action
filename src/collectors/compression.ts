import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import type { CompressionAlgorithm } from './types.js';

export function compressedSize(buffer: Buffer, compression: CompressionAlgorithm): number {
  switch (compression) {
    case 'gzip':
      return zlib.gzipSync(buffer, { level: 9 }).byteLength;
    case 'brotli':
      return zlib.brotliCompressSync(buffer, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY },
      }).byteLength;
    case 'none':
      return buffer.byteLength;
  }
}

/**
 * Caches per-file compressed sizes for one `.next` directory. A chunk that a
 * manifest references but that doesn't exist on disk is a measurement error,
 * never a silent zero.
 */
export class FileSizeCache {
  private readonly cache = new Map<string, number>();

  constructor(
    private readonly nextDir: string,
    private readonly compression: CompressionAlgorithm,
  ) {}

  sizeOf(file: string): number {
    const cached = this.cache.get(file);
    if (cached !== undefined) return cached;
    const resolved = path.join(this.nextDir, file);
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `Referenced chunk "${file}" does not exist under ${this.nextDir}. ` +
          'The build may be incomplete, or a manifest references a stale chunk.',
      );
    }
    const size = compressedSize(fs.readFileSync(resolved), this.compression);
    this.cache.set(file, size);
    return size;
  }

  sizeOfSet(files: Iterable<string>): number {
    let total = 0;
    for (const file of files) total += this.sizeOf(file);
    return total;
  }
}
