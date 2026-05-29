/**
 * @module L2.FileTool
 * FileState — overwrite gate state per file path.
 *
 * phase 1430: replaces flat `fullyReadPaths: Set<string>` with three-field cache:
 *   - hash: SHA-256 of content the agent saw (32 bytes; tolerates mtime false-positives)
 *   - timestamp: file mtime at read time (used for staleness short-circuit)
 *   - isFullRead: true ONLY when read with neither offset nor limit AND no cap triggered AND same-target
 *
 * Map<resolvedPath, FileState> lives on ExecContext; lifecycle = daemon process.
 * Cross-target reads MUST NOT write to caller's map (see §7.A.invariant 2).
 */

import { createHash } from 'crypto';

export interface FileState {
  /** SHA-256 hex digest of content seen by the agent. */
  hash: string;
  /** File mtime (ms epoch) at the time of the read. */
  timestamp: number;
  /**
   * True only if the read covered the entire file:
   * (a) offset and limit both undefined
   * (b) no line cap triggered
   * (c) no byte cap triggered
   * (d) same-target read (no cross-target param)
   */
  isFullRead: boolean;
}

/** Compute SHA-256 hex digest of UTF-8 content (used for overwrite gate equality + mtime FP guard). */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
