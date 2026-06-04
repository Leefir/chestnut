/**
 * Audit 模块内部 helper — TSV 字段转义
 *
 * 转义优先级：\\ 先转（防后续替换产生的 \\ 被二次转义）→ \t / \n / \r / \0
 *
 * 应用范围：writer.ts AuditWriter.write + batched-writer.ts BatchedAuditWriter buffered write
 *
 * Module-local（`_` 前缀、不 export from index.ts barrel、外部不可见）。
 * phase 41 Step B 抽出（auditlog-auditor §7.1 #2 follow-up）。
 */
export function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')   // \\ 先转（防后续替换产生的 \\ 被二次转义）
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0');
}
