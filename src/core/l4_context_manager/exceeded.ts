/**
 * @module L4.ContextManager
 * Context-exceeded handling: trim first, then escalate to next provider.
 *
 * Internally defaults to allowCacheBreak=true for second-pass trim
 * (agent progress > cache hit).
 */

import type { Message } from '../../foundation/llm-provider/types.js';
import { trim } from './trim.js';
import {
  ContextTrimInsufficientWithoutCacheBreakError,
} from './errors.js';

export function handleContextExceeded(
  messages: Message[],
  systemPrompt: string,
  target: number,
): Message[] {
  try {
    return trim(messages, systemPrompt, { target, allowCacheBreak: false }).messages;
  } catch (e) {
    if (e instanceof ContextTrimInsufficientWithoutCacheBreakError) {
      const result = trim(messages, systemPrompt, { target, allowCacheBreak: true });
      // emit cache_invalidated_by_deep_trim
      return result.messages;
    }
    throw e;
  }
}
