import type { CronJob } from '../runner.js';
import { parseSchedule } from '../runner.js';
import type { ClawGlobalConfig } from '../../../foundation/config/index.js';
import type { MemorySystem } from '../../memory/index.js';

/**
 * Cron job timeout (ms) / 防 stuck handler 占 cron tick.
 * dream-trigger 是 assembly 装配 memorySystem capability 的 cron wrapper、
 * 无 dedicated business handler (memorySystem 直调).
 * 故 timeout const inline at module natural owner、显式标 ML#2/#3 例外.
 */
export const DREAM_TRIGGER_CRON_TIMEOUT_MS = 30 * 60_000;  // 30 min

export interface DreamTriggerJobDeps {
  memorySystem: MemorySystem;
}

export function createDreamTriggerJob(
  deps: DreamTriggerJobDeps,
  globalConfig: ClawGlobalConfig,
): CronJob {
  return {
    name: 'dream-trigger',
    enabled: globalConfig.cron.jobs.dream_trigger.enabled,
    schedule: parseSchedule(globalConfig.cron.jobs.dream_trigger.schedule),
    handler: async (signal) => {
      if (!deps.memorySystem) return;
      await deps.memorySystem.runDeepDream(undefined, { signal });
      await deps.memorySystem.runRandomDream({ signal });
    },
    timeoutMs: DREAM_TRIGGER_CRON_TIMEOUT_MS,
  };
}
