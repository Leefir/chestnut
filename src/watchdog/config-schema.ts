/**
 * Watchdog config schema / phase 10 decentralize
 * Owner: watchdog（监控进程参数 yaml schema 业主）
 * Composed by: src/assembly/compose-config.ts (yaml `watchdog.*` field)
 */
import { z } from 'zod';
import {
  WATCHDOG_INTERVAL_MS,
  DEFAULT_DISK_WARNING_MB,
  CLAW_INACTIVITY_TIMEOUT_MS,
} from './constants.js';

export const watchdogConfigSchema = z.object({
  interval_ms: z.number().min(5000).default(WATCHDOG_INTERVAL_MS),
  disk_warning_mb: z.number().min(10).default(DEFAULT_DISK_WARNING_MB),
  claw_inactivity_timeout_ms: z.number().min(60000).default(CLAW_INACTIVITY_TIMEOUT_MS),
});

export type WatchdogConfig = z.infer<typeof watchdogConfigSchema>;
