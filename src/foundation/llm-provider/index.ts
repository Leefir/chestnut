/**
 * @module L1.LLMProvider
 * LLM Provider module (L1) — single provider call primitives
 *
 * Exports: LLMProvider interface, provider adapters, factory
 */

import type { ProviderConfig, ProviderAdapter } from './types.js';
import { AnthropicAdapter } from './anthropic.js';
import { CustomAnthropicAdapter } from './custom-anthropic.js';
import { OpenAIAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';
import { LLMError } from './errors.js';

export type {
  ProviderConfig,
  LLMCallOptions,
  StreamChunk,
  ProviderAdapter,
  ProviderObserver,
} from './types.js';

export {
  withCombinedAbortSignal,
  type AbortReason,
  makeExternalAbortError,
} from './abort-helper.js';
export type { ApiFormat, ProviderPreset } from './presets.js';
export { PRESETS, resolvePreset } from './presets.js';

export type { Message, LLMResponse, ContentBlock, ToolUseBlock, ToolResultBlock, ToolDefinition } from './types.js';

/**
 * LLMProvider interface — single provider call primitive
 *
 * Implemented by all provider adapters (Anthropic, OpenAI, Gemini, etc.)
 */
export interface LLMProvider extends ProviderAdapter {}

/**
 * Validate provider configuration before creating adapter.
 * Throws LLMError with descriptive message on invalid config.
 */
function validateProviderConfig(config: ProviderConfig): void {
  if (!config.apiKey?.trim()) {
    throw new LLMError(
      `ProviderConfig.apiKey is required (provider="${config.name || 'unknown'}")`,
      { provider: config.name, field: 'apiKey' }
    );
  }
  if (!config.model?.trim()) {
    throw new LLMError(
      `ProviderConfig.model is required (provider="${config.name || 'unknown'}")`,
      { provider: config.name, field: 'model' }
    );
  }
  if (!config.apiFormat) {
    throw new LLMError(
      `ProviderConfig.apiFormat is required (provider="${config.name || 'unknown'}")`,
      { provider: config.name, field: 'apiFormat' }
    );
  }
  if (config.maxTokens !== undefined && config.maxTokens <= 0) {
    throw new LLMError(
      `ProviderConfig.maxTokens must be positive (provider="${config.name || 'unknown'}", got=${config.maxTokens})`,
      { provider: config.name, field: 'maxTokens', value: config.maxTokens }
    );
  }
  if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
    throw new LLMError(
      `ProviderConfig.temperature must be in [0, 2] (provider="${config.name || 'unknown'}", got=${config.temperature})`,
      { provider: config.name, field: 'temperature', value: config.temperature }
    );
  }
}

/**
 * Determine whether to use the native Anthropic SDK based on config.
 * Extracted from heuristic to explicit configuration.
 */
function shouldUseAnthropicSdk(config: ProviderConfig): boolean {
  // If explicitly configured, respect the setting
  if ('useSdk' in config) {
    return Boolean((config as ProviderConfig & { useSdk?: boolean }).useSdk);
  }
  // Fallback: heuristic based on model name (deprecated, prefer explicit useSdk)
  return config.model.toLowerCase().includes('claude');
}

/**
 * Provider factory — creates appropriate adapter for config
 */
export function createLLMProvider(config: ProviderConfig): LLMProvider {
  // Test escape hatch: caller may pass a pre-built LLMProvider via duck typing.
  // We narrow with 'stream in config' + function typeof, then cast (one-way) to LLMProvider.
  if ('stream' in config && typeof (config as { stream?: unknown }).stream === 'function') {
    return config as unknown as LLMProvider;
  }

  // Validate configuration before instantiation
  validateProviderConfig(config);

  if (config.apiFormat === 'openai') return new OpenAIAdapter(config);
  if (config.apiFormat === 'gemini') return new GeminiAdapter(config);

  // anthropic format: Claude models use SDK (native API), others use raw fetch
  return shouldUseAnthropicSdk(config)
    ? new AnthropicAdapter(config)
    : new CustomAnthropicAdapter(config);
}
