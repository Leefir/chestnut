/**
 * ExecContext fixture factory
 *
 * Provides `makeExecContext(overrides?)` for sound, type-safe test fixtures.
 * Centralizes default values so field additions only require one change.
 */

import { vi } from 'vitest';
import type { ExecContext } from '../../src/foundation/tool-protocol/index.js';
import type { FileSystem } from '../../src/foundation/fs/types.js';

const noopFs = Object.freeze({}) as unknown as FileSystem;   // phase 907: frozen invariant 防 shared mutable race

export function makeExecContext(overrides: Partial<ExecContext> = {}): ExecContext {
  const defaults: ExecContext = {
    clawId: 'test-claw',
    clawDir: '/tmp/test-claw',
    workspaceDir: '/tmp/test-claw/clawspace',
    syncDir: '/tmp/test-claw/.sync',
    callerType: 'claw',
    fs: noopFs,
    profile: 'full',
    stepNumber: 0,
    maxSteps: 20,
    isMotionChain: false,
    getElapsedMs: () => 0,
    incrementStep: vi.fn(function (this: { stepNumber: number }) { this.stepNumber++; }),
    stopRequested: false,
    requestStop: vi.fn(),
    fullyReadPaths: new Set(),
  } as ExecContext;

  return { ...defaults, ...overrides } as ExecContext;
}
