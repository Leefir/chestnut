// phase 194: REACT_DEFAULT_MAX_TOKENS removed — provider adapter own its API protocol
// (Anthropic must-set via model cap table fallback; OpenAI/Gemini conditional include).
/** Maximum consecutive parse errors before aborting */
export const MAX_CONSECUTIVE_PARSE_ERRORS = 3;

/** Maximum consecutive max_tokens tool_use before aborting */
export const MAX_CONSECUTIVE_MAX_TOKENS_TOOL_USE = 3;
