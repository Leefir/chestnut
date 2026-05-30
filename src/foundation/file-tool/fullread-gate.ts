/**
 * @module L2.FileTool
 * fullread-gate — shared L1+L2 gate for destructive file operations.
 *
 * Used by:
 *   - write overwrite (phase 1447 refactor: was inlined since phase 1430)
 *   - edit replaceAll (phase 1447)
 *   - multi_edit with any replaceAll edit (phase 1447)
 *
 * L1: `readFileState` entry exists AND `isFullRead === true`
 * L2: mtime + content-hash double check (mtime touched but content unchanged
 *      refreshes timestamp + allows; mtime advanced + hash differs rejects)
 *
 * Returns null on pass; otherwise returns `GateReject` with `result`
 * (ToolResult to surface) and `reason` (one of 4 categories for audit).
 *
 * The canonical L1 / L2 messages are stable across callers — tests assert
 * substrings like "not been fully read" and "modified since" against all
 * three tools uniformly.
 *
 * phase 1460: discriminated return — caller emits `reason=${gate.reason}`
 * to OVERWRITE_GATE_REJECTED audit (4 classes: not-read / partial / stale /
 * verify-fail). phase 1447 commit 2 抽 helper 时丢失 reason 分类 →
 * phase 1452 e2e 4 case fail → phase 1460 回填。
 */

import type { ExecContext } from '../tools/index.js';
import type { ToolResult } from '../tool-protocol/index.js';
import { computeContentHash } from './file-hash.js';

export type GateRejectReason = 'not-read' | 'partial' | 'stale' | 'verify-fail';

export interface GateReject {
  result: ToolResult;
  reason: GateRejectReason;
}

export async function enforceFullReadGate(
  ctx: ExecContext,
  resolved: string,
  filePath: string,
): Promise<GateReject | null> {
  const state = ctx.readFileState.get(resolved);
  // L1.a: never-read (no state entry, also covers corrupt-disk → empty Map)
  if (!state) {
    return {
      result: {
        success: false,
        content: `Error: File '${filePath}' has not been fully read in this daemon process. Use \`read\` to cover every current line (start at line 1, with limit >= totalLines, no byte-cap truncation) first.`,
      },
      reason: 'not-read',
    };
  }
  // L1.b: partial-read (state exists but isFullRead=false)
  if (!state.isFullRead) {
    return {
      result: {
        success: false,
        content: `Error: File '${filePath}' has not been fully read in this daemon process. Use \`read\` to cover every current line (start at line 1, with limit >= totalLines, no byte-cap truncation) first.`,
      },
      reason: 'partial',
    };
  }
  // L2: stale (mtime + hash double check)
  try {
    const stat = await ctx.fs.stat(resolved);
    const currentMtime = stat.mtime.getTime();
    if (currentMtime > state.timestamp) {
      const currentContent = await ctx.fs.read(resolved);
      if (computeContentHash(currentContent) !== state.hash) {
        return {
          result: {
            success: false,
            content: `Error: File '${filePath}' has been modified since your last read (either by the user or by another tool). Read it again before this operation.`,
          },
          reason: 'stale',
        };
      }
      // mtime touched but content unchanged (cloud sync / antivirus) — refresh + allow
      state.timestamp = currentMtime;
    }
  } catch {
    return {
      result: {
        success: false,
        content: `Error: Could not verify '${filePath}' is unchanged since last read. Read it again before this operation.`,
      },
      reason: 'verify-fail',
    };
  }
  return null;
}
