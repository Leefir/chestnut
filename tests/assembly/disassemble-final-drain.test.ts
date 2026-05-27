import { describe, it, expect, vi, beforeEach } from 'vitest';
import { disassemble } from '../../src/assembly/disassemble.js';

describe('disassemble final drain (phase 1373 sub-1)', () => {
  let mockInstances: {
    clawId: string;
    runtime: { stop: ReturnType<typeof vi.fn> };
    streamWriter: { close: ReturnType<typeof vi.fn> };
    processManager: { markNotReady: ReturnType<typeof vi.fn>; releaseLock: ReturnType<typeof vi.fn> };
    auditWriter: { write: ReturnType<typeof vi.fn> };
    cronRunner?: { stop: ReturnType<typeof vi.fn> };
    messaging?: { drainOutboxes: ReturnType<typeof vi.fn> };
    gateway?: { stop: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockInstances = {
      clawId: 'test-claw',
      runtime: { stop: vi.fn().mockResolvedValue(undefined) },
      streamWriter: { close: vi.fn() },
      processManager: { markNotReady: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn() },
      auditWriter: { write: vi.fn() },
      cronRunner: { stop: vi.fn() },
      messaging: { drainOutboxes: vi.fn().mockResolvedValue({ delivered: 0, failed: 0 }) },
      gateway: { stop: vi.fn().mockResolvedValue(undefined) },
    };
  });

  it('应在 cron stop 之后 runtime stop 之前调用 messaging.drainOutboxes({ final: true })', async () => {
    await disassemble(mockInstances, 'SIGTERM');

    expect(mockInstances.messaging!.drainOutboxes).toHaveBeenCalledWith({ final: true });
    expect(mockInstances.cronRunner!.stop).toHaveBeenCalledBefore(
      mockInstances.messaging!.drainOutboxes as unknown as ReturnType<typeof vi.fn>,
    );
    expect(mockInstances.messaging!.drainOutboxes).toHaveBeenCalledBefore(
      mockInstances.runtime.stop as unknown as ReturnType<typeof vi.fn>,
    );
  });

  it('messaging.drainOutboxes 抛错时应 audit 并继续后续步骤', async () => {
    mockInstances.messaging!.drainOutboxes.mockRejectedValue(new Error('drain fail'));

    await disassemble(mockInstances, 'SIGTERM');

    expect(mockInstances.auditWriter.write).toHaveBeenCalledWith(
      'disassemble_step_failed',
      'step=final_drain',
      'reason=drain fail',
    );
    expect(mockInstances.runtime.stop).toHaveBeenCalled();
    expect(mockInstances.streamWriter.close).toHaveBeenCalled();
  });

  it('无 messaging 时应跳过 final drain 无副作用', async () => {
    const instancesWithoutMessaging = { ...mockInstances, messaging: undefined };
    await disassemble(instancesWithoutMessaging, 'SIGTERM');

    expect(mockInstances.runtime.stop).toHaveBeenCalled();
    expect(mockInstances.streamWriter.close).toHaveBeenCalled();
    expect(mockInstances.processManager.releaseLock).toHaveBeenCalled();

    const lastCall = mockInstances.auditWriter.write.mock.calls.at(-1);
    expect(lastCall).toEqual(['daemon_stop', 'signal=sigterm']);
  });
});
