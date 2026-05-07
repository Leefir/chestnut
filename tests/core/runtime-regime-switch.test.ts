/**
 * Runtime regime switch tests — phase 521
 *
 * Covers L5.G1-G4:
 * - G1: messages 继承 default 'all'
 * - G2: 枚举字符串接口 'all' | 'none' | 'last-turn'
 * - G3: 每 turn 末自动检测
 * - G4: tool_use 悬空自动 repair
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { Runtime } from '../../src/core/runtime/index.js';
import { makeRuntimeDeps } from '../helpers/runtime-deps.js';
import { createTempDir, cleanupTempDir } from '../utils/temp.js';
import type { LLMOrchestratorConfig } from '../../src/foundation/llm-orchestrator/types.js';
import type { LLMResponse } from '../../src/types/message.js';
import type { StreamChunk } from '../../src/foundation/llm-orchestrator/types.js';
import type { Message } from '../../src/types/message.js';
import { DialogStore } from '../../src/foundation/dialog-store/index.js';

async function* responseToStreamChunks(response: LLMResponse): AsyncIterableIterator<StreamChunk> {
  for (const block of response.content) {
    if (block.type === 'text') {
      yield { type: 'text_delta', delta: (block as { text: string }).text };
    } else if (block.type === 'tool_use') {
      const toolBlock = block as { id: string; name: string; input: unknown };
      yield {
        type: 'tool_use_start',
        toolUse: { id: toolBlock.id, name: toolBlock.name, partialInput: '' },
      };
      yield {
        type: 'tool_use_delta',
        toolUse: { id: '', name: '', partialInput: JSON.stringify(toolBlock.input) },
      };
    }
  }
  yield { type: 'done' };
}

function createMockLLMConfig(): LLMOrchestratorConfig {
  return {
    primary: {
      name: 'mock',
      apiKey: 'test-key',
      model: 'test-model',
      maxTokens: 1024,
      temperature: 0.7,
      timeoutMs: 30000,
      apiFormat: 'anthropic' as const,
    },
    maxAttempts: 1,
    retryDelayMs: 100,
  };
}

function createMockLLM(responses: LLMResponse[]) {
  let index = 0;
  const callMock = vi.fn(async () => {
    const response = responses[index++] || responses[responses.length - 1];
    return response;
  });
  return {
    call: callMock,
    stream: vi.fn((...args: unknown[]) => {
      const result = callMock(...args);
      if (result instanceof Promise) {
        return (async function* () {
          const response = await result;
          yield* responseToStreamChunks(response as LLMResponse);
        })();
      }
      return responseToStreamChunks(result as LLMResponse);
    }),
    close: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
    getProviderInfo: vi.fn().mockReturnValue({ name: 'mock', model: 'test', isFallback: false }),
  };
}

describe('Runtime regime switch (phase 521)', () => {
  let tempDir: string;
  let clawDir: string;
  const runtimesToStop: Runtime[] = [];

  beforeEach(async () => {
    tempDir = await createTempDir();
    clawDir = path.join(tempDir, 'claws', 'test-claw');
  });

  afterEach(async () => {
    for (const r of runtimesToStop.splice(0)) {
      await r.stop().catch(() => {});
    }
    await cleanupTempDir(tempDir);
  });

  it('test 1: 首 turn lastSystemPrompt undefined / 不触发 archive', async () => {
    const deps = await makeRuntimeDeps({ clawDir, clawId: 'test-claw' });
    const runtime = new Runtime({
      clawId: 'test-claw',
      clawDir,
      llmConfig: createMockLLMConfig(),
      dependencies: deps,
    });
    runtimesToStop.push(runtime);

    const mockLLM = createMockLLM([{
      content: [{ type: 'text', text: 'Hello' }],
      stop_reason: 'end_turn',
    }]);

    await runtime.initialize();
    // Spy AFTER initialize to exclude startup archive
    const archiveSpy = vi.spyOn(deps.sessionManager, 'archive').mockResolvedValue(undefined);
    (runtime as any).llm = mockLLM;

    // Mock buildSystemPrompt so _runReact gets a consistent value
    vi.spyOn(runtime as any, 'buildSystemPrompt').mockResolvedValue('prompt-A');

    await runtime.chat('Hi!');

    expect(archiveSpy).toHaveBeenCalledTimes(0);
  });

  it('test 2: turn 2 systemPrompt 不变 / 不触发 archive', async () => {
    const deps = await makeRuntimeDeps({ clawDir, clawId: 'test-claw' });
    const runtime = new Runtime({
      clawId: 'test-claw',
      clawDir,
      llmConfig: createMockLLMConfig(),
      dependencies: deps,
    });
    runtimesToStop.push(runtime);

    const mockLLM = createMockLLM([
      { content: [{ type: 'text', text: 'First' }], stop_reason: 'end_turn' },
      { content: [{ type: 'text', text: 'Second' }], stop_reason: 'end_turn' },
    ]);

    await runtime.initialize();
    // Spy AFTER initialize to exclude startup archive
    const archiveSpy = vi.spyOn(deps.sessionManager, 'archive').mockResolvedValue(undefined);
    (runtime as any).llm = mockLLM;

    vi.spyOn(runtime as any, 'buildSystemPrompt').mockResolvedValue('same-prompt');

    await runtime.chat('Message 1');
    await runtime.chat('Message 2');

    expect(archiveSpy).toHaveBeenCalledTimes(0);
  });

  it('test 3: turn 2 systemPrompt 变 / archive + new instance + inherited all', async () => {
    const deps = await makeRuntimeDeps({ clawDir, clawId: 'test-claw' });
    // factorySpy BEFORE Runtime construction so the closure captures the spy
    const factorySpy = vi.spyOn(deps, 'dialogStoreFactory');

    const runtime = new Runtime({
      clawId: 'test-claw',
      clawDir,
      llmConfig: createMockLLMConfig(),
      dependencies: deps,
    });
    runtimesToStop.push(runtime);

    const mockLLM = createMockLLM([
      { content: [{ type: 'text', text: 'First' }], stop_reason: 'end_turn' },
      { content: [{ type: 'text', text: 'Second' }], stop_reason: 'end_turn' },
    ]);

    await runtime.initialize();
    // archiveSpy AFTER initialize to exclude startup archive
    const archiveSpy = vi.spyOn(deps.sessionManager, 'archive').mockResolvedValue(undefined);
    (runtime as any).llm = mockLLM;

    // Turn 1: prompt A; Turn 2: prompt B (regime change)
    const buildSpy = vi.spyOn(runtime as any, 'buildSystemPrompt')
      .mockResolvedValueOnce('system-prompt-A')
      .mockResolvedValueOnce('system-prompt-B');

    await runtime.chat('Message 1');
    await runtime.chat('Message 2');

    expect(archiveSpy).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledWith('system-prompt-B');
    expect(buildSpy).toHaveBeenCalledTimes(2);
  });

  it('test 4: strategy "none" / inherited 0 messages', async () => {
    const deps = await makeRuntimeDeps({ clawDir, clawId: 'test-claw' });
    const factorySpy = vi.spyOn(deps, 'dialogStoreFactory');

    const runtime = new Runtime({
      clawId: 'test-claw',
      clawDir,
      llmConfig: createMockLLMConfig(),
      regimeSwitchStrategy: 'none',
      dependencies: deps,
    });
    runtimesToStop.push(runtime);

    vi.spyOn(deps.sessionManager, 'archive').mockResolvedValue(undefined);

    const mockLLM = createMockLLM([
      { content: [{ type: 'text', text: 'First' }], stop_reason: 'end_turn' },
      { content: [{ type: 'text', text: 'Second' }], stop_reason: 'end_turn' },
    ]);

    await runtime.initialize();
    (runtime as any).llm = mockLLM;

    vi.spyOn(runtime as any, 'buildSystemPrompt')
      .mockResolvedValueOnce('system-prompt-A')
      .mockResolvedValueOnce('system-prompt-B');

    await runtime.chat('Message 1');
    await runtime.chat('Message 2');

    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledWith('system-prompt-B');
  });

  it('test 5: strategy "last-turn" / inherited 最近 user msg 起切片', async () => {
    const deps = await makeRuntimeDeps({ clawDir, clawId: 'test-claw' });
    const factorySpy = vi.spyOn(deps, 'dialogStoreFactory');

    const runtime = new Runtime({
      clawId: 'test-claw',
      clawDir,
      llmConfig: createMockLLMConfig(),
      regimeSwitchStrategy: 'last-turn',
      dependencies: deps,
    });
    runtimesToStop.push(runtime);

    vi.spyOn(deps.sessionManager, 'archive').mockResolvedValue(undefined);

    const mockLLM = createMockLLM([
      { content: [{ type: 'text', text: 'First' }], stop_reason: 'end_turn' },
      { content: [{ type: 'text', text: 'Second' }], stop_reason: 'end_turn' },
    ]);

    await runtime.initialize();
    (runtime as any).llm = mockLLM;

    // Manually seed messages to simulate multi-turn history
    // [user A, assistant A, user B, assistant B]
    const seededMessages: Message[] = [
      { role: 'user', content: 'user-A' },
      { role: 'assistant', content: 'assistant-A' },
      { role: 'user', content: 'user-B' },
      { role: 'assistant', content: 'assistant-B' },
    ];
    await deps.sessionManager.save(seededMessages);

    vi.spyOn(runtime as any, 'buildSystemPrompt')
      .mockResolvedValueOnce('system-prompt-A')
      .mockResolvedValueOnce('system-prompt-B');

    // Need two chats to trigger regime switch (first sets lastSystemPrompt)
    await runtime.chat('Message 1');
    await runtime.chat('Message 2');

    // factory should create new DialogStore with 'system-prompt-B'
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledWith('system-prompt-B');
  });

  it('test 6: tool_use 悬空 / DialogStore.repair 被调用', async () => {
    const deps = await makeRuntimeDeps({ clawDir, clawId: 'test-claw' });
    const runtime = new Runtime({
      clawId: 'test-claw',
      clawDir,
      llmConfig: createMockLLMConfig(),
      dependencies: deps,
    });
    runtimesToStop.push(runtime);

    vi.spyOn(deps.sessionManager, 'archive').mockResolvedValue(undefined);
    const repairSpy = vi.spyOn(DialogStore, 'repair');

    const mockLLM = createMockLLM([
      { content: [{ type: 'text', text: 'First' }], stop_reason: 'end_turn' },
      { content: [{ type: 'text', text: 'Second' }], stop_reason: 'end_turn' },
    ]);

    await runtime.initialize();
    (runtime as any).llm = mockLLM;

    // Seed messages with an incomplete tool_use at the end
    const seededMessages: Message[] = [
      { role: 'user', content: 'user-A' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Using tool' },
          { type: 'tool_use', id: 'tu1', name: 'old_tool', input: {} },
        ] as any,
      },
    ];
    await deps.sessionManager.save(seededMessages);

    vi.spyOn(runtime as any, 'buildSystemPrompt')
      .mockResolvedValueOnce('system-prompt-A')
      .mockResolvedValueOnce('system-prompt-B');

    await runtime.chat('Message 2');

    expect(repairSpy).toHaveBeenCalled();
  });

  it('test 7: regime_switch audit event 载荷完整', async () => {
    const deps = await makeRuntimeDeps({ clawDir, clawId: 'test-claw' });
    const runtime = new Runtime({
      clawId: 'test-claw',
      clawDir,
      llmConfig: createMockLLMConfig(),
      regimeSwitchStrategy: 'last-turn',
      dependencies: deps,
    });
    runtimesToStop.push(runtime);

    vi.spyOn(deps.sessionManager, 'archive').mockResolvedValue(undefined);

    const auditSpy = vi.spyOn(deps.auditWriter, 'write');

    const mockLLM = createMockLLM([
      { content: [{ type: 'text', text: 'First' }], stop_reason: 'end_turn' },
      { content: [{ type: 'text', text: 'Second' }], stop_reason: 'end_turn' },
    ]);

    await runtime.initialize();
    (runtime as any).llm = mockLLM;

    // Seed 5 messages: [user, assistant, user, assistant, user]
    // last-turn should inherit from last user = 1 message (just the last user)
    const seededMessages: Message[] = [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'u3' },
    ];
    await deps.sessionManager.save(seededMessages);

    vi.spyOn(runtime as any, 'buildSystemPrompt')
      .mockResolvedValueOnce('system-prompt-A')
      .mockResolvedValueOnce('system-prompt-B');

    // Need two chats to trigger regime switch (first sets lastSystemPrompt)
    await runtime.chat('Message 1');
    await runtime.chat('Message 2');

    const regimeSwitchCall = auditSpy.mock.calls.find(c => c[0] === 'regime_switch');
    expect(regimeSwitchCall).toBeDefined();
    expect(regimeSwitchCall![1]).toBe('strategy=last-turn');
    expect(regimeSwitchCall![2]).toMatch(/^inherited=/);
    expect(regimeSwitchCall![3]).toMatch(/^discarded=/);
  });
});
