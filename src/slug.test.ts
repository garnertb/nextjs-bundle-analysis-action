import { slugify } from './slug.js';

describe('slugify', () => {
  it('lowercases and keeps a simple name unchanged', () => {
    expect(slugify('web')).toBe('web');
  });

  it('replaces a scoped package name into a hyphenated slug', () => {
    expect(slugify('@scope/web')).toBe('scope-web');
  });

  it('collapses runs of invalid characters into one hyphen', () => {
    expect(slugify('a___b   c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--edge--')).toBe('edge');
  });

  it('caps length at 63 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toHaveLength(63);
  });

  it('falls back to a default slug when nothing valid remains', () => {
    expect(slugify('!!!')).toBe('bundle-analysis');
  });
});
