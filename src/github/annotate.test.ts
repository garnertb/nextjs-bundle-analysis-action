import { describe, expect, it, vi } from 'vitest';
import { annotateFindings } from './annotate.js';
import type { Finding } from '../thresholds/types.js';

describe('annotateFindings', () => {
  it('emits core.error for fail findings and core.warning for warn findings', () => {
    const error = vi.fn();
    const warning = vi.fn();
    const findings: Finding[] = [
      {
        level: 'fail',
        route: '/blog',
        check: 'Route size',
        value: '300 kB',
        limit: '250 kB',
        message: '/blog is 300 kB, over the 250 kB fail budget.',
      },
      {
        level: 'warn',
        route: '/about',
        check: 'Route increase',
        value: '+10%',
        limit: '5%',
        message: '/about grew 10%, over the 5% warn budget.',
      },
    ];
    annotateFindings({ findings, error, warning });
    expect(error).toHaveBeenCalledWith(
      findings[0]!.message,
      expect.objectContaining({ title: expect.any(String) }),
    );
    expect(warning).toHaveBeenCalledWith(
      findings[1]!.message,
      expect.objectContaining({ title: expect.any(String) }),
    );
  });
});
