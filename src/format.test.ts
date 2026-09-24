import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatConfiguredBytes,
  formatConfiguredPercent,
  formatPercent,
  formatSignedBytes,
  formatSignedPercent,
} from './format.js';

describe('formatBytes', () => {
  it('shows whole bytes under 1000', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(0)).toBe('0 B');
  });

  it('always shows one decimal for kB, even on whole numbers', () => {
    expect(formatBytes(89_000)).toBe('89.0 kB');
    expect(formatBytes(312_800)).toBe('312.8 kB');
    expect(formatBytes(133_900)).toBe('133.9 kB');
  });
});

describe('formatSignedBytes', () => {
  it('prefixes a plus sign for a positive delta', () => {
    expect(formatSignedBytes(24_100)).toBe('+24.1 kB');
  });

  it('prefixes U+2212 MINUS SIGN (not a hyphen) for a negative delta', () => {
    expect(formatSignedBytes(-3_300)).toBe('\u22123.3 kB');
  });

  it('prefixes a plus sign for zero', () => {
    expect(formatSignedBytes(0)).toBe('+0 B');
  });
});

describe('formatPercent / formatSignedPercent', () => {
  it('formats an unsigned percent with one decimal', () => {
    expect(formatPercent(0.083)).toBe('8.3%');
  });

  it('formats a signed percent', () => {
    expect(formatSignedPercent(0.062)).toBe('+6.2%');
    expect(formatSignedPercent(-0.018)).toBe('\u22121.8%');
  });

  it('keeps the sign even when the magnitude rounds to 0.0', () => {
    expect(formatSignedPercent(-0.0002)).toBe('\u22120.0%');
  });
});

describe('formatConfiguredBytes / formatConfiguredPercent', () => {
  it('echoes a whole-kB threshold without a forced decimal', () => {
    expect(formatConfiguredBytes(250_000)).toBe('250 kB');
    expect(formatConfiguredBytes(20_000)).toBe('20 kB');
  });

  it('preserves a fractional threshold', () => {
    expect(formatConfiguredBytes(12_500)).toBe('12.5 kB');
  });

  it('formats sub-1000-byte thresholds as whole bytes', () => {
    expect(formatConfiguredBytes(512)).toBe('512 B');
  });

  it('echoes a whole percent without a forced decimal', () => {
    expect(formatConfiguredPercent(0.05)).toBe('5%');
  });

  it('preserves a fractional percent', () => {
    expect(formatConfiguredPercent(0.155)).toBe('15.5%');
  });
});
