/**
 * Cross-layer foundation constants (L0)
 *
 * AUDIT_PREVIEW_LEN = audit log preview truncation character count.
 * Previously owned by audit module (phase 982 ratify M#3).
 * Revoked by phase 1278 r136 D fork user ratify α path:
 * ML#5 unidirectional dependency trumps M#3 single-source ownership
 * for cross-layer shared knowledge (transport L1, llm-provider L2,
 * contract/spawn/shadow L4 all depend on this value).
 */
export const AUDIT_PREVIEW_LEN = 100;

/**
 * AUDIT_MESSAGE_MAX_CHARS = audit log 单字段最大字符数。
 * phase 1386 从 audit/defaults.ts 提升到 L0，遵循与 AUDIT_PREVIEW_LEN
 * 相同的跨层共享常量 ratification 路径（ML#5 > M#3）。
 * L1 llm-provider SSE parser 等模块通过 L0 引用，避免 L1→L2 反向依赖。
 */
export const AUDIT_MESSAGE_MAX_CHARS = 200;
