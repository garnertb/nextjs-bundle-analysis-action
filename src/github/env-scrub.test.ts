import { describe, expect, it } from 'vitest';
import { scrubBuildEnv } from './env-scrub.js';

describe('scrubBuildEnv', () => {
  it('removes every INPUT_* variable regardless of casing or separators', () => {
    const scrubbed = scrubBuildEnv({
      'INPUT_GITHUB-TOKEN': 'secret-token',
      INPUT_GITHUB_TOKEN: 'secret-token-2',
      'input_build-command': 'pnpm build',
      SAFE_VAR: 'keep-me',
    });
    expect(scrubbed).toEqual({ SAFE_VAR: 'keep-me' });
  });

  it('removes Actions runtime credential variables', () => {
    const scrubbed = scrubBuildEnv({
      ACTIONS_RUNTIME_TOKEN: 'rt',
      ACTIONS_RESULTS_URL: 'https://example.invalid',
      ACTIONS_RUNTIME_URL: 'https://example.invalid',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'idt',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid',
      PATH: '/usr/bin',
    });
    expect(scrubbed).toEqual({ PATH: '/usr/bin' });
  });

  it('passes caller-supplied build secrets through unchanged', () => {
    const scrubbed = scrubBuildEnv({
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
      MY_BUILD_SECRET: 'shh',
    });
    expect(scrubbed).toEqual({
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
      MY_BUILD_SECRET: 'shh',
    });
  });

  it('drops undefined values', () => {
    const scrubbed = scrubBuildEnv({ SET: 'yes', UNSET: undefined });
    expect(scrubbed).toEqual({ SET: 'yes' });
  });
});
