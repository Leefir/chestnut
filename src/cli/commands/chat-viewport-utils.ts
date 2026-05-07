/**
 * @module L6.CLI.ChatViewport.Utils
 * Pure utility helpers for chat-viewport — 0 闭包依赖
 */

import * as path from 'path';
import { InboxWriter } from '../../foundation/messaging/index.js';
import { createDirContext } from '../utils/factories.js';
import type { FileSystem } from '../../foundation/fs/types.js';

/** 写用户输入到 inbox（chat 命令期间用户输入流入 daemon）/ 1:1 保 chat-viewport.ts:78-89 body */
export function writeUserChat(agentDir: string, message: string): void {
  const inboxDir = path.join(agentDir, 'inbox', 'pending');
  const { fs, audit } = createDirContext(agentDir);
  new InboxWriter(fs, inboxDir, audit).writeSync({
    type: 'user_chat',
    source: 'user',
    priority: 'high',
    body: message,
    idPrefix: 'chat',
  });
}

/** 格式化毫秒为可读时长 / 1:1 保 chat-viewport.ts:90-95 body */
export function fmtDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/**
 * 启动期 backward scan stream.jsonl 找最近 turn_start byte offset。
 *
 * 修 spinner 不显示 bug：chat-viewport 启动晚于 daemon（PROCESS_SPAWN_CONFIRM_MS = 3000ms /
 * daemon 50ms 已 emit turn_start + llm_start）/ streamReader 默认 offset = file size 跳过这些 events /
 * spinner 不启动。本函数返最近 turn_start 的 byte offset / 让 reader 从该 offset 起 replay 当前 turn events。
 *
 * @param fs - FileSystem
 * @param streamPath - stream.jsonl 路径（相对于 fs baseDir）
 * @param scanBytes - 反向 scan 字节数 / default 64KB（覆盖最近多个 turn 已足够）
 * @returns byte offset of 最近 turn_start line 起点 / 没找到时返 file size（fallback to tail mode）
 */
export function findRecentTurnStartOffset(fs: FileSystem, streamPath: string, scanBytes = 64 * 1024): number {
  if (!fs.existsSync(streamPath)) return 0;
  const size = fs.statSync(streamPath).size;
  if (size === 0) return 0;
  const readStart = Math.max(0, size - scanBytes);
  const buf = fs.readBytesSync(streamPath, readStart, size);
  const text = buf.toString('utf-8');
  // 反向找最近 `"type":"turn_start"` 的 line 起点
  const marker = '"type":"turn_start"';
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return size;  // 没找到 / fallback to tail mode
  // 找该 line 起点（marker 前最近的 \n + 1 / 或 readStart 段开头）
  const lineStartInBuf = text.lastIndexOf('\n', idx) + 1;  // -1 + 1 = 0 (段开头)
  const fileOffset = readStart + lineStartInBuf;
  // 边界：如果 readStart > 0 且 lineStartInBuf == 0 / line 可能截断 / 跳到下一行起点
  if (readStart > 0 && lineStartInBuf === 0) {
    const nextNl = text.indexOf('\n');
    if (nextNl === -1) return size;
    return readStart + nextNl + 1;
  }
  return fileOffset;
}
