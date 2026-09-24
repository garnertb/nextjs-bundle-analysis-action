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
}

/**
 * Runs `build-command` in `workingDirectory` with a scrubbed environment.
 * Throws on `pull_request_target`/`workflow_run` (untrusted-code risk) or a
 * non-zero exit code.
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
  const exitCode = await run(options.command, undefined, {
    cwd: options.workingDirectory,
    env: scrubBuildEnv(options.env ?? process.env),
  });
  if (exitCode !== 0) {
    throw new Error(`build-command exited with code ${exitCode}.`);
  }
}
