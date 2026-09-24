import { describe, expect, it, vi } from 'vitest';
import { runBuildCommand } from './build.js';

describe('runBuildCommand', () => {
  it('refuses to run on pull_request_target', async () => {
    const execMock = vi.fn();
    await expect(
      runBuildCommand({
        command: 'pnpm build',
        workingDirectory: '.',
        eventName: 'pull_request_target',
        exec: execMock,
      }),
    ).rejects.toThrow(/pull_request_target/);
    expect(execMock).not.toHaveBeenCalled();
  });

  it('refuses to run on workflow_run', async () => {
    const execMock = vi.fn();
    await expect(
      runBuildCommand({
        command: 'pnpm build',
        workingDirectory: '.',
        eventName: 'workflow_run',
        exec: execMock,
      }),
    ).rejects.toThrow(/workflow_run/);
    expect(execMock).not.toHaveBeenCalled();
  });

  it('runs the command with a scrubbed env in the working directory', async () => {
    let capturedEnv: Record<string, string> | undefined;
    const execMock = vi.fn(async (_command, _args, options) => {
      capturedEnv = options?.env as Record<string, string>;
      return 0;
    });
    await runBuildCommand({
      command: 'pnpm build',
      workingDirectory: '/repo/apps/web',
      eventName: 'pull_request',
      env: { 'INPUT_GITHUB-TOKEN': 'secret', MY_SECRET: 'keep-me' },
      exec: execMock,
    });
    expect(execMock).toHaveBeenCalledWith(
      'pnpm build',
      undefined,
      expect.objectContaining({ cwd: '/repo/apps/web' }),
    );
    expect(capturedEnv).toEqual({ MY_SECRET: 'keep-me' });
  });

  it('throws on a non-zero exit code', async () => {
    const execMock = vi.fn(async () => 1);
    await expect(
      runBuildCommand({
        command: 'pnpm build',
        workingDirectory: '.',
        eventName: 'push',
        exec: execMock,
      }),
    ).rejects.toThrow(/exited with code 1/);
  });
});
