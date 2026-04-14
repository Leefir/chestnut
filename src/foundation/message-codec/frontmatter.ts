/**
 * YAML frontmatter parser utility
 * 
 * Unified implementation to replace 5 duplicated copies across the codebase.
 * 
 * Features:
 * - Supports `: ` (preferred) and `:` (compatibility)
 * - Strips quotes from values ("value" or 'value' → value)
 * - Returns { meta, body } format
 */

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  // Normalize CRLF to LF for consistent parsing
  const normalized = raw.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n')) return { meta: {}, body: raw };
  const afterOpen = normalized.slice(4);
  const closeIdx = afterOpen.indexOf('\n---\n');
  if (closeIdx < 0) {
    throw new Error('Malformed frontmatter: missing closing ---');
  }

  const meta: Record<string, string> = {};
  const frontmatterSection = afterOpen.slice(0, closeIdx);
  let bodyLength: number | undefined;

  for (const line of frontmatterSection.split('\n')) {
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const key = line.slice(0, ci).trim();
    const value = line.slice(ci + 1).trim().replace(/^["']|["']$/g, '');
    if (key === '_body_length') {
      bodyLength = parseInt(value, 10);
    } else {
      meta[key] = value;
    }
  }

  // 如果有 _body_length，用精确长度切分 body（不受 body 中 \n---\n 干扰）
  const bodyStart = afterOpen.slice(closeIdx + 5);
  if (bodyLength !== undefined && !isNaN(bodyLength)) {
    return { meta, body: bodyStart.slice(0, bodyLength).trim() };
  }

  return { meta, body: bodyStart.trim() };
}
