/**
 * @module L4.Permissions
 * Permission audit events const namespace
 */

export const PERMISSION_AUDIT_EVENTS = {
  STRICT_DISABLED: 'permission_strict_disabled',
  // NEW phase 276 Step B: deny 决策 audit observability
  READ_PATH_OUTSIDE_CLAW_SPACE: 'permission_read_path_outside_claw_space',
  WRITE_PATH_OUTSIDE_CLAW_SPACE: 'permission_write_path_outside_claw_space',
  WRITE_SYSTEM_READONLY: 'permission_write_system_readonly',
  WRITE_OUTSIDE_ALLOWLIST: 'permission_write_outside_allowlist',
} as const;


/**
 * Phase 163 业主声明 file 归属（phase 122 §5.A + §6.7 + phase 159 模式）.
 *
 * 全 'audit'：业务事件归业务事件主 file（信噪比已通过 cron tick 分流改善）.
 */
export const PERMISSIONS_FILE_ROUTING: Readonly<Record<string, 'audit'>> = {
  permission_strict_disabled: 'audit',
  // NEW phase 276 Step B
  permission_read_path_outside_claw_space: 'audit',
  permission_write_path_outside_claw_space: 'audit',
  permission_write_system_readonly: 'audit',
  permission_write_outside_allowlist: 'audit',
} as const;
