/**
 * git-gc-weekly cron job audit events（业主自治、归 helper）。
 * 字符串值与 cron 命名空间起步态等价（phase 129 仅迁命名空间、不改 wire 格式）。
 */
export const GIT_GC_WEEKLY_AUDIT_EVENTS = {
  GIT_GC_WEEKLY: 'cron_git_gc_weekly',
} as const;
