/**
 * vitest globalSetup — auto-build dist/cli.js if missing (phase 245).
 *
 * Background: a small number of CLI smoke tests
 * (tests/cli/parseint-nan-guard-smoke.test.ts +
 *  tests/cli/program-top-level-help-claw-term.test.ts)
 * spawn the built CLI subprocess at runtime. They guard against the
 * worktree-with-no-dist state with `if (!existsSync(CLI_ENTRY)) throw`,
 * which previously surfaced as stable failures after `git worktree add`
 * until the developer manually ran `pnpm build`.
 *
 * vitest's globalSetup runs once before any test files load, so this is
 * the right hook to ensure the precondition is met. It is cache-safe:
 * `existsSync` short-circuits when dist/cli.js is already present (~ms).
 *
 * Out of scope (and intentionally so):
 * - Does NOT verify dist freshness against src — a developer who changed
 *   src code is responsible for rebuilding. Stale dist would silently make
 *   the smoke tests assert against the previous CLI binary; that's a
 *   different debt class (dist staleness) tracked separately.
 * - Does NOT participate in cross-worktree races: each worktree has its
 *   own dist/ directory, and the build runs synchronously here before
 *   vitest forks any workers.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

export default function globalSetup(): void {
  const cwd = process.cwd();
  const distCli = path.join(cwd, 'dist', 'cli.js');
  if (existsSync(distCli)) return;

  process.stderr.write(
    '[vitest-globalSetup] dist/cli.js missing — running pnpm build (one-time per worktree)...\n',
  );
  const r = spawnSync('pnpm', ['run', 'build'], { stdio: 'inherit', cwd });
  if (r.status !== 0) {
    throw new Error(
      `[vitest-globalSetup] pnpm build failed (exit ${r.status}); CLI smoke tests will fail without dist/cli.js`,
    );
  }
}
