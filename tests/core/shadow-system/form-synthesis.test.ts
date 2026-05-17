/**
 * shadow-system Form B synthesis tests (phase 767, phase 770 删 Form A)
 */

import { describe, it, expect } from 'vitest';
import { synthesizeFormB } from '../../../src/core/shadow-system/_helpers.js';
import { SHADOW_INSTRUCTION_PREFIX, buildShadowAckMessage } from '../../../src/prompts/shadow.js';
import type { Message } from '../../../src/types/message.js';

describe('shadow form synthesis', () => {
  const baseInstructionArgs = {
    shadowId: 'shadow-abc123',
    spawnedAt: '2024-01-01T00:00:00Z',
    spawnedByClawId: 'main-claw',
    toolUseId: 'tu-xyz789',
    task: 'Compute 1+1',
  } as const;

  describe('synthesizeFormB', () => {
    it('appends fresh user message with instruction', () => {
      const mainMessagesBeforeMarker: Message[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'reply' },
      ];

      const result = synthesizeFormB({
        mainMessagesBeforeMarker,
        instructionArgs: { ...baseInstructionArgs },
      });

      expect(result).toHaveLength(mainMessagesBeforeMarker.length + 3);
      const last = result[result.length - 1];
      expect(last.role).toBe('user');
      expect(last.content).toBe('Proceed.');
      const instructionMsg = result[mainMessagesBeforeMarker.length];
      expect(instructionMsg.role).toBe('user');
      expect(typeof instructionMsg.content).toBe('string');
      expect(instructionMsg.content).toContain(SHADOW_INSTRUCTION_PREFIX);
      expect(instructionMsg.content).toContain('shadow_id: shadow-abc123');
      expect(instructionMsg.content).toContain('Compute 1+1');
    });

    it('does not include marker assistant', () => {
      const mainMessagesBeforeMarker: Message[] = [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
      ];

      const result = synthesizeFormB({
        mainMessagesBeforeMarker,
        instructionArgs: { ...baseInstructionArgs },
      });

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual(mainMessagesBeforeMarker[0]);
      expect(result[1]).toEqual(mainMessagesBeforeMarker[1]);
    });

    it('返末三条 role 序列 = user → assistant → user (phase 945 γ 3-turn)', () => {
      const result = synthesizeFormB({
        mainMessagesBeforeMarker: [
          { role: 'user', content: 'main-1' },
          { role: 'assistant', content: 'main-2' },
        ],
        instructionArgs: { ...baseInstructionArgs, shadowId: 'abc12345' },
      });
      expect(result.length).toBe(5); // 2 main + 3 synthesized
      expect(result[2]).toEqual({ role: 'user', content: expect.stringContaining(SHADOW_INSTRUCTION_PREFIX) });
      expect(result[3].role).toBe('assistant');
      expect(result[3].content).toContain('shadow-abc12345');
      expect(result[3].content).toContain('I am NOT Motion');
      expect(result[4]).toEqual({ role: 'user', content: 'Proceed.' });
    });

    it('buildShadowAckMessage shadowId 嵌入正确', () => {
      const ack = buildShadowAckMessage('xyz98765');
      expect(ack).toContain('shadow-xyz98765');
      expect(ack).toContain('I am NOT Motion');
      expect(ack.startsWith('Understood.')).toBe(true);
    });

    it('main messages prefix 不变（cache invariant）', () => {
      const main: Message[] = [
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
      ];
      const result = synthesizeFormB({
        mainMessagesBeforeMarker: main,
        instructionArgs: { ...baseInstructionArgs, shadowId: 'test' },
      });
      expect(result.slice(0, 2)).toEqual(main); // prefix bit-identical
    });
  });
});
