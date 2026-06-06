/**
 * Runtime tool content truncate helper (phase 140 §5.D Step D).
 *
 * Atomic invariant: truncate + emit content_size are inseparable.
 * 调用方不可只截不 emit size、不可 emit size 不截。
 *
 * Owner: runtime module (M#5: audit 模块不知 tool 语义、helper 归业主).
 */

import { createHash } from 'node:crypto';

/** Runtime tool result summary 截断长度。phase 136 §5.D §4.2 推荐 200。 */
export const RUNTIME_TOOL_MAX_CHARS = 200;

export interface TruncateResult {
  /** Preview content (≤ max_chars + ellipsis if truncated) */
  readonly preview: string;
  /** Cols to append to audit emit (baseCols + content_size + maybe hash) */
  readonly cols: readonly string[];
}

/**
 * Truncate content to max_chars + emit content_size col + optional content_hash.
 *
 * @param content - original content string (e.g. tool result)
 * @param baseCols - existing cols to extend (e.g. ['summary=...', 'status=ok'])
 * @returns { preview, cols } where cols = baseCols + content_size + (maybe content_hash)
 */
export function truncateToolContent(
  content: string,
  baseCols: readonly string[],
  options?: { withHash?: boolean; maxChars?: number },
): TruncateResult {
  if (typeof content !== 'string') {
    throw new Error(`truncateToolContent: expected string, got ${typeof content}`);
  }
  const maxChars = options?.maxChars ?? RUNTIME_TOOL_MAX_CHARS;
  if (maxChars < 1) {
    throw new Error(`truncateToolContent: maxChars must be ≥ 1, got ${maxChars}`);
  }

  const origSize = Buffer.byteLength(content, 'utf-8');
  const preview = content.length > maxChars
    ? `${content.slice(0, maxChars)}…`
    : content;

  const cols: string[] = [...baseCols, `content_size=${origSize}`];
  if (options?.withHash) {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
    cols.push(`content_hash=${hash}`);
  }

  return { preview, cols };
}
