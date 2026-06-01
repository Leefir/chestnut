/**
 * @module L4.AsyncTaskSystem
 * phase 7: AsyncTaskSystem 自家 'task_queue_overflow' inbox 消息 formatter.
 *
 * 业务语义归 AsyncTaskSystem（pending queue 是它自家 in-memory state、它知 overflow）。
 * trivial passthrough — body 由 system.ts 拼 self-contained framing.
 *
 * Mirror src/watchdog/inbox-formatter.ts + src/core/contract/inbox-formatters.ts 模板.
 */

import type { MessageFormatter, MessageFormatterRegistry } from '../../foundation/messaging/index.js';

export const formatTaskQueueOverflow: MessageFormatter = async ({ body, timestampSec }) =>
  `[system message${timestampSec}] ${body}`;

export function registerAsyncTaskSystemFormatters(registry: MessageFormatterRegistry): void {
  registry.register('task_queue_overflow', formatTaskQueueOverflow);
}
