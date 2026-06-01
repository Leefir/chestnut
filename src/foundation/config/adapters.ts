/**
 * Phase 10 Step B: re-export shim (legacy import path).
 * Adapters 业务已迁 foundation/llm-orchestrator/config-adapter.ts (M#2 业务语义归属).
 * Step D 删 file、caller 同步切 new import path.
 */
export { toProviderConfig, buildLLMConfig } from '../llm-orchestrator/config-adapter.js';
