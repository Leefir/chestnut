/**
 * @module L4.ContextManager
 * Token budget computation
 */

export interface BudgetInputs {
  providerContextWindow: number;        // provider upper limit (injected by LLMOrchestrator)
  reserveOutputTokens: number;          // reserved for output (max_tokens)
  systemPromptTokens: number;
  toolsForLLMTokens: number;
}

export interface BudgetResult {
  available: number;                    // messages budget (= window - reserve - sys - tools)
  warnThreshold: number;                // threshold triggering context_budget_warn audit (default 0.85 × available)
}

export function computeBudget(i: BudgetInputs): BudgetResult {
  const available = Math.max(0, i.providerContextWindow - i.reserveOutputTokens - i.systemPromptTokens - i.toolsForLLMTokens);
  return {
    available,
    warnThreshold: Math.floor(available * 0.85),
  };
}
