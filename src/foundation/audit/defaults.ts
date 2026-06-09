/**
 * Audit 模块行为默认值 const
 *
 * AUDIT_PREVIEW_LEN = audit log 短预览字段最大字符数（"glance" level，如 raw= / templateName= / intent=）。
 * AUDIT_MESSAGE_MAX_CHARS = audit log 中等上下文字段最大字符数（"reason / error / command" level）。
 * SUMMARY_MAX_CHARS = audit summary 字段最大字符数（"tool_result / long content summary" level）。
 */

/** Audit log 短预览字段最大字符数（"glance" level，如 raw= / templateName= / intent=）。 */
export const AUDIT_PREVIEW_LEN = 100;

/** Audit log 中等上下文字段最大字符数（"reason / error / command" level）。 */
export const AUDIT_MESSAGE_MAX_CHARS = 200;

/** Audit summary 字段最大字符数（"tool_result / long content summary" level）。 */
export const SUMMARY_MAX_CHARS = 500;
