import {
  ClawError,
  type ErrorCode,
} from '../errors.js';

// ============================================================================
// LLM Errors
// ============================================================================

export class LLMError extends ClawError {
  readonly code: ErrorCode = 'LLM_CALL_FAILED';
}

export class LLMRateLimitError extends LLMError {
  readonly code: ErrorCode = 'LLM_RATE_LIMITED';
  readonly retryAfter?: number;

  constructor(provider: string, retryAfter?: number) {
    super(
      `Rate limited by provider "${provider}"`,
      { provider, retryAfter }
    );
    this.retryAfter = retryAfter;
  }
}

export class LLMTimeoutError extends LLMError {
  readonly code: ErrorCode = 'LLM_TIMEOUT';
  readonly timeoutMs: number;

  constructor(provider: string, timeoutMs: number) {
    super(
      `LLM call to "${provider}" timed out after ${timeoutMs}ms`,
      { provider, timeoutMs }
    );
    this.timeoutMs = timeoutMs;
  }
}

export class LLMAuthError extends LLMError {
  readonly code: ErrorCode = 'LLM_AUTH_FAILED';
  constructor(provider: string, statusCode: number, message?: string) {
    super(
      message ?? `LLM auth failed for ${provider} (HTTP ${statusCode})`,
      { provider, statusCode },
    );
  }
}

export class LLMNetworkError extends LLMError {
  readonly code: ErrorCode = 'LLM_NETWORK_FAILED';
  constructor(provider: string, cause?: Error) {
    super(
      `LLM network failure for ${provider}${cause ? `: ${cause.message}` : ''}`,
      { provider },
      cause,
    );
  }
}

export class LLMEmptyResponseError extends LLMError {
  readonly code: ErrorCode = 'LLM_EMPTY_RESPONSE';
  constructor(provider: string) {
    super(
      `LLM returned empty response from ${provider}`,
      { provider },
    );
  }
}

export class LLMModelNotFoundError extends LLMError {
  readonly code: ErrorCode = 'LLM_MODEL_NOT_FOUND';
  constructor(provider: string, model: string) {
    super(
      `LLM model not found: ${provider}/${model} (HTTP 404)`,
      { provider, model },
    );
  }
}

export class LLMAllProvidersFailedError extends LLMError {
  readonly code: ErrorCode = 'LLM_ALL_PROVIDERS_FAILED';
  readonly failures: Array<{ provider: string; error: Error }>;

  constructor(failures: Array<{ provider: string; error: Error }>) {
    const summary = failures
      .map(f => `${f.provider} (${f.error.message.slice(0, 80)})`)
      .join(', ');
    super(
      `All LLM providers failed: ${summary}`,
      { failures: failures.map(f => ({ provider: f.provider, error: f.error.message })) }
    );
    this.failures = failures;
  }
}

export type LLMErrorClass = 'permanent' | 'transient' | 'rate_limit' | 'abort' | 'unknown';

export function classifyLLMError(err: unknown): LLMErrorClass {
  if (err instanceof LLMAuthError || err instanceof LLMModelNotFoundError) return 'permanent';
  if (err instanceof LLMRateLimitError) return 'rate_limit';
  if (err instanceof LLMNetworkError || err instanceof LLMTimeoutError) return 'transient';
  if (err instanceof Error && err.name === 'AbortError') return 'abort';
  if (err instanceof LLMError) return 'transient';
  return 'unknown';
}

export type UserActionHint =
  | 'rotate_api_key'
  | 'switch_primary'
  | 'wait_retry_after'
  | 'check_quota'
  | null;

export function getUserActionHint(err: unknown): UserActionHint {
  if (err instanceof LLMAuthError) {
    const msg = err.message.toLowerCase();
    if (msg.includes('quota') || msg.includes('credit') || msg.includes('insufficient')) {
      return 'check_quota';
    }
    return 'rotate_api_key';
  }
  if (err instanceof LLMModelNotFoundError) return 'switch_primary';
  if (err instanceof LLMRateLimitError) return 'wait_retry_after';
  return null;
}
