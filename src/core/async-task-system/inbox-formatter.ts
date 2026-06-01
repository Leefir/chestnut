/**
 * @module L4.AsyncTaskSystem
 * phase 7: AsyncTaskSystem 自家 'task_queue_overflow' inbox 消息 formatter.
 * phase 9: + 'task_result' (sub-agent → 父 claw result delivery / 'message' catch-all 拆解).
 *
 * 业务语义归 AsyncTaskSystem（pending queue + result-delivery 都是它的）.
 * trivial passthrough — body 由 sender 拼 self-contained framing (JSON or text).
 */

import type { MessageFormatter, MessageFormatterRegistry } from '../../foundation/messaging/index.js';

export const formatTaskQueueOverflow: MessageFormatter = async ({ body, timestampSec }) =>
  `[system message${timestampSec}] ${body}`;

export const formatTaskResult: MessageFormatter = async ({ body, timestampSec }) =>
  `[system message${timestampSec}] ${body}`;

export function registerAsyncTaskSystemFormatters(registry: MessageFormatterRegistry): void {
  registry.register('task_queue_overflow', formatTaskQueueOverflow);
  registry.register('task_result', formatTaskResult);
}
