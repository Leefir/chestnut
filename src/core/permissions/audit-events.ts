/**
 * @module L4.Permissions
 * Permission audit events const namespace
 */

export const PERMISSION_AUDIT_EVENTS = {
  STRICT_DISABLED: 'permission_strict_disabled',
} as const;


/**
 * Phase 163 业主声明 file 归属（phase 122 §5.A + §6.7 + phase 159 模式）.
 *
 * 全 'audit'：业务事件归业务事件主 file（信噪比已通过 cron tick 分流改善）.
 */
export const PERMISSIONS_FILE_ROUTING: Readonly<Record<string, 'audit'>> = {
  permission_strict_disabled: 'audit',
} as const;
