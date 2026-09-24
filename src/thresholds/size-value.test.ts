import { describe, expect, it } from 'vitest';
import { parseByteSize, parsePercent, parseSizeOrPercent } from './size-value.js';

describe('parseByteSize', () => {
  it('parses whole bytes', () => {
    expect(parseByteSize('512B')).toBe(512);
  });

  it('parses kB as decimal (1000-based)', () => {
    expect(parseByteSize('250kB')).toBe(250_000);
  });

  it('parses fractional kB', () => {
    expect(parseByteSize('12.5kB')).toBe(12_500);
  });

  it('is case-insensitive on the unit', () => {
    expect(parseByteSize('250KB')).toBe(250_000);
    expect(parseByteSize('512b')).toBe(512);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseByteSize('  250kB  ')).toBe(250_000);
  });

  it('throws for an unrecognized format', () => {
    expect(() => parseByteSize('250 megabytes')).toThrow(/Invalid size/);
  });

  it('throws for a percent string', () => {
    expect(() => parseByteSize('10%')).toThrow(/Invalid size/);
  });
});

describe('parsePercent', () => {
  it('parses a whole percent', () => {
    expect(parsePercent('10%')).toBe(0.1);
  });

  it('parses a fractional percent', () => {
    expect(parsePercent('5.5%')).toBeCloseTo(0.055);
  });

  it('throws for a missing percent sign', () => {
    expect(() => parsePercent('10')).toThrow(/Invalid percent/);
  });
});

describe('parseSizeOrPercent', () => {
  it('parses a byte size', () => {
    expect(parseSizeOrPercent('20kB')).toEqual({ kind: 'bytes', bytes: 20_000 });
  });

  it('parses a percent', () => {
    expect(parseSizeOrPercent('15%')).toEqual({ kind: 'percent', fraction: 0.15 });
  });
});
