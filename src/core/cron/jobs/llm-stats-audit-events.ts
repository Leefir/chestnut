/**
 * llm-stats cron job audit events（业主自治、归 helper）。
 * 字符串值与 cron 命名空间起步态等价（phase 129 仅迁命名空间、不改 wire 格式）。
 */
export const LLM_STATS_AUDIT_EVENTS = {
  LLM_STATS: 'cron_llm_stats',
} as const;
