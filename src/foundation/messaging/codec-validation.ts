/**
 * Inbox message validation utilities
 * Message field validation for Messaging
 */

import type { InboxMessage } from '../messaging/types.js';
import type { Priority } from '../messaging/types.js';

export const VALID_PRIORITIES: Priority[] = ['critical', 'high', 'normal', 'low'];
/**
 * 已知 inbox type list — informational only / 不强制（M9 phase 575）。
 * Caller 可写任意 type / decoder loose 接受 / 防 silent UX drift。
 */
export const KNOWN_INBOX_TYPES = [
  'user_chat', 'user_inbox_message',
  'crash_notification', 'heartbeat', 'claw_outbox',
  'verification_result', 'verification_rejection', 'verification_error',
  'random_dream', 'deep_dream',
  // phase 8: cron_disk_warning + audit_size_alert 移除（dev_warning 改 viewport stream）
  // phase 9: 'message' catch-all 拆为 4 typed event:
  'task_result', 'contract_created', 'contract_resume', 'contract_audit_feedback',
];

export function validatePriority(value: unknown): Priority {
  if (typeof value === 'string' && VALID_PRIORITIES.includes(value as Priority)) {
    return value as Priority;
  }
  return 'normal';
}

export function validateType(value: unknown): InboxMessage['type'] {
  // loose validation：接受任意 string / 防 silent UX drift（M9 phase 575）
  // 保 string 类型 cast / 非 string fallback 'user_inbox_message'（phase 9：'message' catch-all 移除）
  if (typeof value === 'string') {
    return value as InboxMessage['type'];
  }
  return 'user_inbox_message';
}
