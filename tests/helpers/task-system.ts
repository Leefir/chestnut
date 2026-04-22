import { vi } from 'vitest';
import type { LLMService } from '../../src/foundation/llm/index.js';
import type { SkillRegistry } from '../../src/core/skill/registry.js';
import type { ContractManager } from '../../src/core/contract/manager.js';
import type { OutboxWriter } from '../../src/foundation/messaging/index.js';
import type { AuditWriter } from '../../src/foundation/audit/writer.js';
import type { FileSystem } from '../../src/foundation/fs/types.js';
import { TaskSystem, type TaskSystemOptions } from '../../src/core/task/system.js';

export function makeTaskSystemDeps(
  llm?: LLMService,
): Pick<TaskSystemOptions, 'llm' | 'skillRegistry' | 'contractManager' | 'outboxWriter'> {
  return {
    llm: llm ?? ({} as unknown as LLMService),
    skillRegistry: {
      getSkills: vi.fn(() => []),
      loadAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as SkillRegistry,
    contractManager: {
      loadPaused: vi.fn(),
      resume: vi.fn(),
      setOnNotify: vi.fn(),
    } as unknown as ContractManager,
    outboxWriter: {
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as OutboxWriter,
  };
}

export function createTestTaskSystem(
  clawDir: string,
  fs: FileSystem,
  auditWriter: AuditWriter,
  llm?: LLMService,
  overrides?: Partial<Omit<TaskSystemOptions, 'llm' | 'skillRegistry' | 'contractManager' | 'outboxWriter'>>,
): TaskSystem {
  const deps = makeTaskSystemDeps(llm);
  return new TaskSystem(clawDir, fs, {
    auditWriter,
    ...deps,
    ...overrides,
  });
}
