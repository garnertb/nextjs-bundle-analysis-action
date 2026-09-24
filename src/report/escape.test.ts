import { describe, expect, it } from 'vitest';
import { codeSpan, escapeCell } from './escape.js';

describe('escapeCell', () => {
  it('escapes a pipe so it cannot break out of a table cell', () => {
    expect(escapeCell('a|b')).toBe('a\\|b');
  });

  it('strips control characters and newlines', () => {
    expect(escapeCell('a\nb\tc\u0007d')).toBe('abcd');
  });

  it('strips a literal HTML comment close so it cannot prematurely close the hidden marker', () => {
    expect(escapeCell('/evil-->route')).toBe('/evilroute');
  });

  it('strips a literal HTML comment open', () => {
    expect(escapeCell('/evil<!--route')).toBe('/evilroute');
  });
});

describe('codeSpan', () => {
  it('wraps plain text in a single backtick pair', () => {
    expect(codeSpan('/dashboard')).toBe('`/dashboard`');
  });

  it('escapes a pipe inside the text before wrapping', () => {
    expect(codeSpan('/a|b')).toBe('`/a\\|b`');
  });

  it('uses a longer fence when the text contains a backtick', () => {
    expect(codeSpan('/a`b')).toBe('``/a`b``');
  });

  it('uses an even longer fence for a text containing a double-backtick run', () => {
    expect(codeSpan('/a``b')).toBe('```/a``b```');
  });

  it('pads when the text starts or ends with a backtick', () => {
    expect(codeSpan('`leading')).toBe('`` `leading ``');
    expect(codeSpan('trailing`')).toBe('`` trailing` ``');
  });
});
