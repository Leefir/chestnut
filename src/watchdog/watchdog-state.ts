/**
 * @module L6.Watchdog.State
 * Watchdog state persistence — load/save 2 Map + crash log
 */

import * as path from 'path';
import { getClawforumDir, getClawforumFs, getAuditWriter, lastInactivityNotified, inactivityNotifyCount } from './watchdog-context.js';
import { WATCHDOG_AUDIT_EVENTS } from './audit-events.js';

interface WatchdogState {
  version?: number;  // v0 = absent (legacy), v1 = current
  lastInactivityNotified: Record<string, number>;
  inactivityNotifyCount: Record<string, number>;
}

/** 1:1 保 watchdog.ts:204-206 */
function getWatchdogStateFile(): string {
  return path.join(getClawforumDir(), 'watchdog-state.json');
}

/** 1:1 保 watchdog.ts:208-238 / load 2 Map */
export function loadWatchdogState(): void {
  try {
    const fs = getClawforumFs();
    const raw = fs.readSync('watchdog-state.json');
    const state = JSON.parse(raw) as WatchdogState;
    // version ?? 0 — 旧文件无 version 字段，视为 v0，兼容加载
    for (const [k, v] of Object.entries(state.lastInactivityNotified ?? {})) {
      lastInactivityNotified.set(k, v);
    }
    for (const [k, v] of Object.entries(state.inactivityNotifyCount ?? {})) {
      inactivityNotifyCount.set(k, v);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // 首次启动 — 从空状态开始
      return;
    }
    // 文件损坏（SyntaxError / 字段类型错等）
    const fs = getClawforumFs();
    const backupPath = `watchdog-state.json.corrupt-${Date.now()}`;
    try {
      fs.moveSync('watchdog-state.json', backupPath);
    } catch {
      // move 失败不重试
    }
    const auditWriter = getAuditWriter();
    auditWriter?.write(
      WATCHDOG_AUDIT_EVENTS.STATE_LOAD_FAILED,
      `backup=${backupPath} err=${(err as Error).message?.slice(0, 200) ?? String(err)}`,
    );
  }
}

/** 1:1 保 watchdog.ts:240-249 / save 2 Map */
export function saveWatchdogState(): void {
  const state: WatchdogState = {
    version: 1,
    lastInactivityNotified: Object.fromEntries(lastInactivityNotified),
    inactivityNotifyCount: Object.fromEntries(inactivityNotifyCount),
  };
  const fs = getClawforumFs();
  fs.writeAtomicSync('watchdog-state.json', JSON.stringify(state, null, 2));
}

/** 1:1 保 watchdog.ts:264-269 */
export function writeWatchdogCrash(err: Error): void {
  try {
    const auditWriter = getAuditWriter();
    auditWriter?.write(WATCHDOG_AUDIT_EVENTS.CRASH, `err=${err.message?.slice(0, 200) ?? String(err)}`);
  } catch { /* ignore: crash handler 不抛 */ }
}
