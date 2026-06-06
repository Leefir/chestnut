/** Token reserve for thinking budget calculation */
export const THINKING_TOKEN_RESERVE = 1024;

/** Maximum duration for a single LLM stream call (ms) - 5 minutes */
export const STREAM_MAX_DURATION_MS = 5 * 60 * 1000;

/** Maximum idle timeout for SSE stream parsers (ms) — independent from stream duration */
export const STREAM_IDLE_MAX_MS = 60_000;

/**
 * OpenAI formatter tool_result content_preview audit row payload 截断 cap.
 * 用于 audit row 显示 tool_result.content 短摘要、防 audit row 字段过长。
 */
export const OPENAI_FORMATTER_CONTENT_PREVIEW_CHARS = 80;
