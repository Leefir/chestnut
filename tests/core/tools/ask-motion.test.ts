import { describe, it, expect } from 'vitest';
import { AskMotionTool } from '../../../src/core/tools/builtins/ask-motion.js';
import type { LLMService } from '../../../src/foundation/llm/index.js';
import type { Message } from '../../../src/types/message.js';

function createMockLLM(answerText: string): LLMService {
  return {
    call: async () => ({
      content: [{ type: 'text', text: answerText }],
      stop_reason: 'end_turn',
    }),
  } as LLMService;
}

describe('AskMotionTool', () => {
  it('consecutive executes produce strictly alternating user/assistant sequence', async () => {
    let callCount = 0;
    const llm = {
      call: async () => {
        callCount += 1;
        return {
          content: [{ type: 'text', text: `answer-${callCount}` }],
          stop_reason: 'end_turn',
        };
      },
    } as LLMService;

    const tool = new AskMotionTool(
      llm,
      async () => 'system prompt',
      () => [],
      [],
    );

    await tool.execute({ question: 'q1' });
    await tool.execute({ question: 'q2' });

    const history = (tool as unknown as { cloneHistory: Message[] }).cloneHistory;
    const roles = history.map(m => m.role);

    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant']);
  });
});
