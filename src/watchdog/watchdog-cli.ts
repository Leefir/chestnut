/**
 * @module L6.Watchdog.Cli
 * Watchdog CLI subcommands — start + stop
 */

import { spawnDetached } from '../foundation/process-exec/spawn-detached.js';
import { setTimeout } from 'timers/promises';
import {
  getWatchdogEntryPath,
} from './watchdog-context.js';
import {
  writeWatchdogPid, getWatchdogPid, isWatchdogAlive, removeWatchdogPid,
} from './watchdog-pid.js';

/** 1:1 保 watchdog.ts:514-543 / startCommand */
export async function startCommand(): Promise<void> {
  const watchdogEntryPath = getWatchdogEntryPath();

  // 幂等：本 workspace 的 watchdog 已在运行则直接返回
  if (isWatchdogAlive()) {
    console.log(`Watchdog already running (PID: ${getWatchdogPid()})`);
    return;
  }

  // spawn watchdog，显式传 CLAWFORUM_ROOT
  const clawforumRoot = process.env.CLAWFORUM_ROOT ?? process.cwd();
  spawnDetached('node', [watchdogEntryPath], {
    env: { ...process.env, CLAWFORUM_ROOT: clawforumRoot },
  });

  // 等待 PID 文件写入
  let attempts = 0;
  while (!isWatchdogAlive() && attempts < 30) {
    await setTimeout(100);
    attempts++;
  }

  const pid = getWatchdogPid();
  if (pid) {
    console.log(`Watchdog started (PID: ${pid})`);
  } else {
    console.log('Watchdog may have failed to start');
  }
}

/** 1:1 保 watchdog.ts:545-580 / stopCommand */
export async function stopCommand(): Promise<void> {
  const pid = getWatchdogPid();
  
  if (!pid || !isWatchdogAlive()) {
    console.log('Watchdog is not running');
    removeWatchdogPid();
    return;
  }
  
  console.log(`Stopping watchdog (PID: ${pid})...`);
  
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    console.log('Failed to send SIGTERM:', err);
  }
  
  // Wait up to 5s
  let attempts = 0;
  while (isWatchdogAlive() && attempts < 50) {
    await setTimeout(100);
    attempts++;
  }
  
  if (isWatchdogAlive()) {
    console.log('Watchdog still alive, sending SIGKILL...');
    try {
      process.kill(pid, 'SIGKILL');
    } catch (err) {
      console.log('Failed to send SIGKILL:', err);
    }
    await setTimeout(500);
  }
  
  removeWatchdogPid();
  console.log('Watchdog stopped');
}
