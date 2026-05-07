import { describe, it, expect } from 'vitest';
import { buildSubagentSystemPromptPrefix } from '../../src/prompts/subagent.js';

describe('buildSubagentSystemPromptPrefix', () => {
  it('includes taskId workspace and caller clawId', () => {
    const result = buildSubagentSystemPromptPrefix({
      taskId: 'abc123',
      callerClawId: 'main-claw',
    });
    expect(result).toContain('tasks/subagents/abc123/');
    expect(result).toContain('claw "main-claw"');
    expect(result).toContain('claw: "main-claw"');
  });

  it('mentions tool defaults and cross-claw access', () => {
    const result = buildSubagentSystemPromptPrefix({
      taskId: 'x',
      callerClawId: 'caller',
    });
    expect(result).toContain('exec / read / write / search / ls');
    expect(result).toContain('默认在 your workspace');
    expect(result).toContain('访问 caller 的资源用');
  });
});
