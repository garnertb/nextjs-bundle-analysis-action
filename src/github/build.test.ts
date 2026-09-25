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

  it('runs the command through sh -c with a scrubbed env in the working directory', async () => {
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
      platform: 'linux',
    });
    expect(execMock).toHaveBeenCalledWith(
      'sh',
      ['-c', 'pnpm build'],
      expect.objectContaining({ cwd: '/repo/apps/web', windowsVerbatimArguments: false }),
    );
    expect(capturedEnv).toEqual({ MY_SECRET: 'keep-me' });
  });

  it('runs the command through cmd /d /s /c on Windows, quoted and verbatim', async () => {
    const execMock = vi.fn(async () => 0);
    await runBuildCommand({
      command: 'pnpm build --filter "web"',
      workingDirectory: '.',
      eventName: 'push',
      exec: execMock,
      platform: 'win32',
    });
    expect(execMock).toHaveBeenCalledWith(
      'cmd',
      ['/d', '/s', '/c', '"pnpm build --filter "web""'],
      expect.objectContaining({ windowsVerbatimArguments: true }),
    );
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

  it('runs && chains and pipes as a real shell would, not literal argv', async () => {
    // A regression test with the real @actions/exec, so a future change back
    // to a bare (non-shell) invocation is caught: without a shell, `&&`
    // becomes a literal argument and the second command never runs.
    let stdout = '';
    await runBuildCommand({
      command: 'echo one && echo two | tr a-z A-Z',
      workingDirectory: '.',
      eventName: 'push',
      exec: async (commandLine, args, options) => {
        const actualExec = (await import('@actions/exec')).exec;
        return actualExec(commandLine, args, {
          ...options,
          listeners: {
            stdout: (data: Buffer) => {
              stdout += data.toString();
            },
          },
        });
      },
      platform: 'linux',
    });
    expect(stdout).toContain('one');
    expect(stdout).toContain('TWO');
  });

  it('exposes the scrubbed env to shell variable expansion, not the raw process env', async () => {
    let stdout = '';
    await runBuildCommand({
      command: 'printenv INPUT_GITHUB-TOKEN 2>/dev/null; echo "[$MY_SECRET]"',
      workingDirectory: '.',
      eventName: 'push',
      env: { 'INPUT_GITHUB-TOKEN': 'secret', MY_SECRET: 'keep-me' },
      exec: async (commandLine, args, options) => {
        const actualExec = (await import('@actions/exec')).exec;
        return actualExec(commandLine, args, {
          ...options,
          listeners: {
            stdout: (data: Buffer) => {
              stdout += data.toString();
            },
          },
        });
      },
      platform: 'linux',
    });
    expect(stdout).toContain('[keep-me]');
    expect(stdout).not.toContain('secret');
  });
});
