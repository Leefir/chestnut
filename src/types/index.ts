/**
 * Types module - Unified exports
 * Phase 0: All type definitions
 */

// Message types
export type {
  Role,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,
  Message,
  ToolDefinition,
  LLMResponse,
  JSONSchema7,
} from './message.js';

// Contract types
export type {
  ContractStatus,
  SubTask,
  Contract,
} from './contract.js';

// Messaging types
export type {
  InboxMessage,
  OutboxMessage,
  HeartbeatEntry,
} from './messaging.js';

// Priority (shared)
export type { Priority } from './priority.js';

// Config types
export type { ToolProfile } from './config.js';

// Error types
export type {
  ErrorCode,
  ErrorDetails,
} from './errors.js';

export {
  ClawError,
  PermissionError,
  PathNotInClawSpaceError,
  WriteOperationForbiddenError,
  ToolError,
  ToolNotFoundError,
  ToolInvalidInputError,
  ToolTimeoutError,
  LLMError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMAuthError,
  LLMNetworkError,
  LLMEmptyResponseError,
  LLMModelNotFoundError,
  LLMAllProvidersFailedError,
  FileNotFoundError,
  MaxStepsExceededError,
  ConsecutiveParseErrorsExceededError,
  ConsecutiveMaxTokensToolUseError,
  WallTimeExceededError,
} from './errors.js';

export { classifyLLMError, getUserActionHint, isProgrammingBug } from './errors.js';
export { formatErr, safeNumber } from './utils.js';

// Signal types (control-flow throws, not errors)
export {
  IdleTimeoutSignal,
  PriorityInboxInterrupt,
  UserInterrupt,
} from './signals.js';

// Result ADT (phase202 搬自 foundation/common/result.ts)
export { ok, err, type Result } from './result.js';

// oneLine helper (phase203 搬自 foundation/utils/string.ts)
export { oneLine } from './utils.js';
