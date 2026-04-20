import type { Instances } from './index.js';

export async function disassemble(instances: Instances, signal: string): Promise<void> {
  const { gateway, runtime, streamWriter, processManager, auditWriter, cronRunner, clawId } = instances;

  // Step 1: gateway?.stop()（async；motion only；最前位置——切断对外推送 + cancel pending askUser）
  if (gateway) {
    try {
      await gateway.stop();
    } catch (e) {
      auditWriter.write(
        'disassemble_step_failed',
        `step=gateway_stop`,
        `reason=${_reason(e)}`,
      );
    }
  }

  // Step 2: cronRunner?.stop()（sync；motion + cron.enabled 才装）
  if (cronRunner) {
    try {
      cronRunner.stop();
    } catch (e) {
      auditWriter.write(
        'disassemble_step_failed',
        `step=cron_stop`,
        `reason=${_reason(e)}`,
      );
    }
  }

  // Step 3: runtime.stop()（async）
  try {
    await runtime.stop();
  } catch (e) {
    auditWriter.write(
      'disassemble_step_failed',
      `step=runtime_stop`,
      `reason=${_reason(e)}`,
    );
  }

  // Step 4: streamWriter.close()（sync）
  try {
    streamWriter.close();
  } catch (e) {
    auditWriter.write(
      'disassemble_step_failed',
      `step=stream_close`,
      `reason=${_reason(e)}`,
    );
  }

  // Step 5: processManager.releaseLock(clawId)（sync）
  try {
    processManager.releaseLock(clawId);
  } catch (e) {
    auditWriter.write(
      'disassemble_step_failed',
      `step=release_lock`,
      `reason=${_reason(e)}`,
    );
  }

  // Step 6: audit daemon_stop（最后）
  auditWriter.write('daemon_stop', `signal=${signal.toLowerCase()}`);
}

function _reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
