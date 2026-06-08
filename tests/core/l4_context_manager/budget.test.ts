import { describe, it, expect } from 'vitest';
import { computeBudget } from '../../../src/core/l4_context_manager/budget.js';

describe('computeBudget', () => {
  it('公式：available = window - reserve - sys - tools', () => {
    const r = computeBudget({
      providerContextWindow: 200000,
      reserveOutputTokens: 8000,
      systemPromptTokens: 2000,
      toolsForLLMTokens: 1500,
    });
    expect(r.available).toBe(200000 - 8000 - 2000 - 1500);
  });

  it('warnThreshold 默 0.85 × available', () => {
    const r = computeBudget({
      providerContextWindow: 100000,
      reserveOutputTokens: 0,
      systemPromptTokens: 0,
      toolsForLLMTokens: 0,
    });
    expect(r.warnThreshold).toBe(Math.floor(100000 * 0.85));
  });

  it('边界：window < reserve+sys+tools → available=0', () => {
    const r = computeBudget({
      providerContextWindow: 1000,
      reserveOutputTokens: 500,
      systemPromptTokens: 400,
      toolsForLLMTokens: 200,  // 总 1100 > window 1000
    });
    expect(r.available).toBe(0);
    expect(r.warnThreshold).toBe(0);
  });
});
