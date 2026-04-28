/**
 * Frontmatter parser — 应然外通用 parser（不构成正式模块）
 *
 * 纯 YAML frontmatter 字符串解析 / 无 I/O / 无副作用 / 无 runtime 依赖 / 无对上层类型依赖。
 *
 * 历史：phase 361 从 L2 Messaging（message-codec/inbox.ts）抽出 / 当时同时治理
 * inbox/outbox 编解码与 InboxMessage（L2 业务类型）/ 编解码部分留 L2 Messaging /
 * 此纯解析器抽出避免双 caller（SkillSystem L2 + Tools L3 builtins/memory_search）复制。
 *
 * 应然定位：不算正式模块（L1 = OS/external 抽象 / 此物纯字符串解析不符）/
 * 不在 modules.md 模块清单（L1 5 模块固定）/ 仅作跨模块复用避复制 utility。
 * 详见 design/modules.md L1 节末「应然外通用 parser」节。
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
  for (const line of afterOpen.slice(0, closeIdx).split('\n')) {
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const key = line.slice(0, ci).trim();
    const value = line.slice(ci + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = value;
  }

  // Everything after the closing --- is the body
  return { meta, body: afterOpen.slice(closeIdx + 5).trim() };
}
