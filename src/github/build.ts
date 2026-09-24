import * as exec from '@actions/exec';
import { scrubBuildEnv } from './env-scrub.js';

/**
 * Events on which running an arbitrary `build-command` would execute
 * untrusted code (from a fork's PR) with access to this workflow's secrets
 * and `github-token`. Refused outright rather than scrubbed around.
 */
const UNSAFE_BUILD_EVENTS = new Set(['pull_request_target', 'workflow_run']);

export interface RunBuildCommandOptions {
  command: string;
  workingDirectory: string;
  eventName: string;
  env?: NodeJS.ProcessEnv;
  /** Injectable for tests; defaults to `@actions/exec`'s `exec`. */
  exec?: typeof exec.exec;
  /** Injectable for tests; defaults to `process.platform`. */
  platform?: NodeJS.Platform;
}

/**
 * Splits `command` into a shell invocation. `@actions/exec`'s `exec()` runs
 * a bare command line without ever invoking a shell, so operators like
 * `&&`, `|`, and `$VAR` expansion are passed through literally to the first
 * program's argv instead of being interpreted (e.g. `pnpm install && pnpm
 * build` would run `pnpm` with the literal arguments `install`, `&&`,
 * `pnpm`, `build`, silently skipping the second command). Route it through
 * a real shell instead, matching how `run:` steps behave elsewhere in a
 * workflow.
 */
function toShellInvocation(
  command: string,
  platform: NodeJS.Platform,
): { commandLine: string; args: string[] } {
  return platform === 'win32'
    ? { commandLine: 'cmd', args: ['/d', '/s', '/c', command] }
    : { commandLine: 'bash', args: ['-c', command] };
}

/**
 * Runs `build-command` in `workingDirectory` through a shell, with a
 * scrubbed environment. Throws on `pull_request_target`/`workflow_run`
 * (untrusted-code risk) or a non-zero exit code.
 */
export async function runBuildCommand(options: RunBuildCommandOptions): Promise<void> {
  if (UNSAFE_BUILD_EVENTS.has(options.eventName)) {
    throw new Error(
      `build-command is refused on the "${options.eventName}" event: it would run ` +
        'repository code with access to secrets and github-token before that code is ' +
        'reviewed. Build in a separate, trusted step instead.',
    );
  }

  const run = options.exec ?? exec.exec;
  const { commandLine, args } = toShellInvocation(
    options.command,
    options.platform ?? process.platform,
  );
  const exitCode = await run(commandLine, args, {
    cwd: options.workingDirectory,
    env: scrubBuildEnv(options.env ?? process.env),
  });
  if (exitCode !== 0) {
    throw new Error(`build-command exited with code ${exitCode}.`);
  }
}
