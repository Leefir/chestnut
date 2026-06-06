/**
 * Memory tool/dream content truncate helper (phase 140 §5.D Step D).
 *
 * Atomic invariant: truncate + emit content_size are inseparable.
 *
 * Owner: memory module.
 */

import { createHash } from 'node:crypto';

/** Memory dream content 截断长度（dream output 较长，选 500）。 */
export const MEMORY_DREAM_MAX_CHARS = 500;

export interface TruncateResult {
  readonly preview: string;
  readonly cols: readonly string[];
}

export function truncateToolContent(
  content: string,
  baseCols: readonly string[],
  options?: { withHash?: boolean; maxChars?: number },
): TruncateResult {
  if (typeof content !== 'string') {
    throw new Error(`truncateToolContent: expected string, got ${typeof content}`);
  }
  const maxChars = options?.maxChars ?? MEMORY_DREAM_MAX_CHARS;
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
