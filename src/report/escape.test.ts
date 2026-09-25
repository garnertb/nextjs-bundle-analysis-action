import { codeSpan, escapeCell } from './escape.js';

describe('escapeCell', () => {
  it('escapes a pipe so it cannot break out of a table cell', () => {
    expect(escapeCell('a|b')).toBe('a\\|b');
  });

  it('strips control characters and newlines', () => {
    expect(escapeCell('a\nb\tc\u0007d')).toBe('abcd');
  });

  it('encodes a literal HTML comment close so it cannot prematurely close the hidden marker', () => {
    expect(escapeCell('/evil-->route')).toBe('/evil--&gt;route');
  });

  it('encodes a literal HTML comment open', () => {
    expect(escapeCell('/evil<!--route')).toBe('/evil&lt;!--route');
  });

  it('is not bypassable by concatenation across encoded fragments', () => {
    expect(escapeCell('---->>')).not.toContain('-->');
    const spoofed = '<!<!---- nextjs-bundle-analysis:web ---->>';
    const result = escapeCell(spoofed);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('<!--');
    expect(result).not.toContain('-->');
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

  it('renders angle brackets literally, unlike escapeCell', () => {
    expect(codeSpan('/a<b>')).toBe('`/a<b>`');
  });

  it('neutralizes a literal HTML comment close without entity-encoding it', () => {
    const result = codeSpan('/evil-->route');
    expect(result).not.toContain('-->');
    expect(result).not.toContain('&gt;');
  });

  it('neutralizes a literal HTML comment open without entity-encoding it', () => {
    const result = codeSpan('/evil<!--route');
    expect(result).not.toContain('<!--');
    expect(result).not.toContain('&lt;');
  });

  it('is not bypassable by concatenation across neutralized fragments', () => {
    expect(codeSpan('---->>')).not.toContain('-->');
    const spoofed = '<!<!---- nextjs-bundle-analysis:web ---->>';
    const result = codeSpan(spoofed);
    expect(result).not.toContain('<!--');
    expect(result).not.toContain('-->');
  });
});
