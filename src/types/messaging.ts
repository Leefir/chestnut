/**
 * Messaging types - Inbox/Outbox message interfaces and heartbeat
 */

import type { Priority } from './priority.js';

export interface InboxMessage {
  id: string;
  type: 'message' | 'user_chat' | 'user_inbox_message' | 'crash_notification' | 'heartbeat' | 'claw_outbox' | string;
  from: string;        // Sender Claw/Motion ID
  to: string;          // Recipient Claw ID
  content: string;
  priority: Priority;
  timestamp: string;
  contract_id?: string;
  reply_to?: string;   // For threading
  extraMeta?: Record<string, string>;   // decode 时保存白名单外的字段
}

export interface OutboxMessage {
  id: string;
  type: 'response' | 'contract_update' | 'status_report' | 'report' | 'question' | 'result' | 'error';
  from: string;        // Sender Claw ID
  to: string;          // Recipient Claw/Motion ID
  content: string;
  timestamp: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  contract_id?: string;
  in_reply_to?: string;
}

export interface HeartbeatEntry {
  claw_id: string;
  timestamp: string;
  status: 'idle' | 'working' | 'error';
  current_contract?: string;
  message_count: number;
  memory_usage?: number;
}
