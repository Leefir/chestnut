/**
 * @module L6.Watchdog
 * createWatchdogPort 工厂 — 装配 H9 WatchdogPort
 *
 * 物理迁自 src/foundation/config/factories.ts（phase419 / cross-layer 治理）
 * 应然权威 = arch §30「Watchdog L6 进程边界」/ 工厂归 watchdog 模块同层
 */

import type { WatchdogPort } from '../cli/watchdog-port.js';
import {
  getWatchdogPid,
  isWatchdogAlive,
  getWatchdogEntryPath,
  startCommand as watchdogStart,
  stopCommand as watchdogStop,
} from './watchdog.js';

/**
 * createWatchdogPort
 *
 * 输入：无参数
 * 输出：WatchdogPort adapter / 包装 watchdog 模块导出为 port interface
 * 边界：structural typing / watchdog 侧 0 改
 */
export function createWatchdogPort(): WatchdogPort {
  return {
    getWatchdogPid,
    isWatchdogAlive,
    getWatchdogEntryPath,
    startCommand: watchdogStart,
    stopCommand: watchdogStop,
  };
}
