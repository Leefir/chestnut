/**
 * @module L3.AgentExecutor
 * AgentExecutor module (L3) — agent 完整循环算法
 *
 * arch §19: 「跑 agent 循环的算法原语 / 不持业务语义 / L3 agent 原语 ——『agent 循环』」
 *
 * runReact 是 AgentExecutor 的便捷装配 entry（向后兼容 shim from phase183）
 */

export { runAgent } from './agent-executor.js';
export type { AgentInput, AgentResult } from './agent-executor.js';

// runReact shim（装配 StepExecutor + AgentExecutor 完整 React 循环）
export { runReact } from './loop.js';
export type { ReactOptions, ReactResult } from './loop.js';
