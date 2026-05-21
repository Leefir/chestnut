// Thin wrapper — re-exports from canonical owners.
// During migration. Once all consumers import from canonical source, this file is deleted.

export type { ErrorCode, ErrorDetails } from '../foundation/errors.js';
export {
  ClawError,
  PermissionError,
  PathNotInClawSpaceError,
  WriteOperationForbiddenError,
  ToolError,
  ToolNotFoundError,
  ToolInvalidInputError,
  ToolTimeoutError,
  isProgrammingBug,
} from '../foundation/errors.js';

export {
  LLMError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMAuthError,
  LLMNetworkError,
  LLMEmptyResponseError,
  LLMModelNotFoundError,
  LLMAllProvidersFailedError,
  classifyLLMError,
  getUserActionHint,
} from '../foundation/llm-orchestrator/errors.js';
export type { LLMErrorClass, UserActionHint } from '../foundation/llm-orchestrator/errors.js';

export { FileNotFoundError } from '../foundation/fs/types.js';

export {
  MaxStepsExceededError,
  ConsecutiveParseErrorsExceededError,
  ConsecutiveMaxTokensToolUseError,
  WallTimeExceededError,
} from '../core/agent-executor/errors.js';
