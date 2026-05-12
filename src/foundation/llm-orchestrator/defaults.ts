// src/foundation/llm-orchestrator/defaults.ts
/**
 * LLMOrchestrator 模块行为默认值 const
 * phase 748 物理迁自 src/constants.ts、M#3 资源唯一归属合规
 * mirror phase 745+746+747 owner module barrel 模板 N=4
 *
 * DEFAULT_LLM_IDLE_TIMEOUT_MS = LLM stream idle timeout 默认值
 * 由 config boundary（zod schema + cli/init）resolve、其他 caller ctor required
 */
export const DEFAULT_LLM_IDLE_TIMEOUT_MS = 60000;
