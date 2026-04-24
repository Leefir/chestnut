import { runWatchdogLoop, writeWatchdogCrash } from './cli/commands/watchdog.js';

const errMsg = (reason: unknown): string =>
  reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason);

process.on('uncaughtException', (err) => {
  try { writeWatchdogCrash(err); } catch {}
  console.error('[watchdog] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  try { writeWatchdogCrash(new Error(errMsg(reason))); } catch {}
  console.error('[watchdog] Unhandled rejection:', reason);
  process.exit(1);
});

await runWatchdogLoop();
