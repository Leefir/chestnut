/**
 * @module L4.OutboxSummary
 * phase 1476: dedup query — 用 motion inbox 自身状态判定是否已发同 hash 版本.
 *
 * 不立独立 last-sent state file（user 2026-05-30 ratify 反 anti-pattern #3）.
 * dedup 凭文件名编入 hash + 扫 motion/inbox/{pending, done|mtime<24h}.
 */

import * as path from 'path';
import type { FileSystem } from '../../foundation/fs/types.js';

export const DEDUP_DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Filename pattern: `<ts>_claw_outbox_summary_<hash12>_<uuid8>.md`. */
export const SUMMARY_FILENAME_PATTERN = /^\d+_claw_outbox_summary_([a-f0-9]{12})_[a-f0-9]{8}\.md$/;

export type DedupHit = 'pending' | 'done' | null;

export interface DedupDeps {
  motionInboxDir: string;    // <root>/motion/inbox
  fs: FileSystem;
  now?: () => number;        // for test injection
}

/**
 * Look for existing summary file containing `hash`:
 * - pending (any age)
 * - done (mtime within 24h)
 */
export function findExistingSummaryByHash(deps: DedupDeps, hash: string): DedupHit {
  const now = deps.now?.() ?? Date.now();

  // pending: any age
  const pendingHit = scanDir(deps.fs, path.join(deps.motionInboxDir, 'pending'), hash);
  if (pendingHit) return 'pending';

  // done: mtime within 24h
  const doneDir = path.join(deps.motionInboxDir, 'done');
  const cutoff = now - DEDUP_DONE_WINDOW_MS;
  try {
    const files = deps.fs.listSync(doneDir, { includeDirs: false });
    for (const f of files) {
      const m = f.name.match(SUMMARY_FILENAME_PATTERN);
      if (!m || m[1] !== hash) continue;
      try {
        const stat = deps.fs.statSync(path.join(doneDir, f.name));
        if (stat.mtime.getTime() >= cutoff) return 'done';
      } catch { /* silent: race deleted between list and stat */ }
    }
  } catch {
    // silent: done dir missing / list failed → no dedup hit (treat as not-found / cron tick 异常隔离)
  }
  return null;
}

function scanDir(fs: FileSystem, dir: string, hash: string): string | null {
  try {
    const files = fs.listSync(dir, { includeDirs: false });
    for (const f of files) {
      const m = f.name.match(SUMMARY_FILENAME_PATTERN);
      if (m && m[1] === hash) return f.name;
    }
  } catch {
    // silent: dir missing / list failed → no dedup hit
  }
  return null;
}

/** List all summary files currently in motion/inbox/pending (used to clear old versions). */
export function listPendingSummaries(deps: DedupDeps): string[] {
  const pendingDir = path.join(deps.motionInboxDir, 'pending');
  try {
    return deps.fs.listSync(pendingDir, { includeDirs: false })
      .filter(f => SUMMARY_FILENAME_PATTERN.test(f.name))
      .map(f => f.name);
  } catch {
    // silent: pending dir missing → 0 existing summaries
    return [];
  }
}
