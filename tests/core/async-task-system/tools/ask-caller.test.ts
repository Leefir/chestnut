/**
 * ask-caller tool reject path tests (phase 990 / r121 F fork)
 *
 * Per phase 990 plan §2.2:
 * - 3 real α reject path test (empty question / missing parent context / MarkerNotFoundError catch)
 * - happy-path placeholder REFRAMED-not-test (phase 909 γ-ratify boundary)
 * - outbox claim PHANTOM-not-test (grep 0 outbox hit)
 */
import { describe, it, expect, vi } from 'vitest';
import { askCallerTool } from '../../../../src/core/async-task-system/tools/ask-caller.js';
import { MarkerNotFoundError } from '../../../../src/foundation/dialog-store/index.js';
import type { ExecContext } from '../../../../src/foundation/tool-protocol/index.js';

function makeCtx(overrides: Partial<ExecContext> = {}): ExecContext {
  return {
    mainDialogStore: undefined,
    mainContextSnapshot: undefined,
    ...overrides,
  } as ExecContext;
}

describe('askCallerTool (phase 990)', () => {
  it('empty question rejects with missing question error', async () => {
    const ctx = makeCtx();
    const result = await askCallerTool.execute({ question: '' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('missing question');
    expect(result.content).toContain('question is required');
  });

  it('missing parent context rejects with no main context error', async () => {
    const ctx = makeCtx({ mainDialogStore: undefined, mainContextSnapshot: undefined });
    const result = await askCallerTool.execute({ question: 'why?' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('no main context');
    expect(result.content).toContain('parent context not available');
  });

  it('MarkerNotFoundError catch returns marker not found error', async () => {
    const mockSnapshot = { toolUseId: 'task-xxx' } as unknown as NonNullable<ExecContext['mainContextSnapshot']>;
    const mockStore = {
      restorePrefix: vi.fn().mockRejectedValue(new MarkerNotFoundError('claw-1', 'task-xxx')),
    };
    const ctx = makeCtx({ mainDialogStore: mockStore as unknown as ExecContext['mainDialogStore'], mainContextSnapshot: mockSnapshot });
    const result = await askCallerTool.execute({ question: 'why?' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('marker not found');
    expect(result.content).toContain('marker not found');
    expect(result.content).toContain('toolUseId=task-xxx');
  });

  // phase 990 plan §2.2: happy-path placeholder + outbox claim intentionally not tested
});
