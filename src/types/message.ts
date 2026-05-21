// Thin wrapper — re-exports from canonical owner foundation/llm-provider/types.ts (L1 LLMProvider)
// During migration. Once all consumers import from canonical source, this file is deleted.

export type {
  Role,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  UnknownBlock,
  ContentBlock,
  Message,
  ToolDefinition,
  LLMResponse,
  JSONSchema7,
} from '../foundation/llm-provider/types.js';
