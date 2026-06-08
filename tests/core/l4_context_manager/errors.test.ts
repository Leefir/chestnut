import { describe, it, expect } from 'vitest';
import {
  ContextTrimExhaustedError,
  ContextTrimInsufficientWithoutCacheBreakError,
} from '../../../src/core/l4_context_manager/errors.js';

describe('ContextManager typed errors', () => {
  it('ContextTrimExhaustedError name + instanceof', () => {
    const e = new ContextTrimExhaustedError('msg');
    expect(e.name).toBe('ContextTrimExhaustedError');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ContextTrimExhaustedError);
  });

  it('ContextTrimInsufficientWithoutCacheBreakError name + instanceof', () => {
    const e = new ContextTrimInsufficientWithoutCacheBreakError('msg');
    expect(e.name).toBe('ContextTrimInsufficientWithoutCacheBreakError');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ContextTrimInsufficientWithoutCacheBreakError);
  });

  it('二者不同 class、catch 可区分', () => {
    const a = new ContextTrimExhaustedError('a');
    expect(a).not.toBeInstanceOf(ContextTrimInsufficientWithoutCacheBreakError);
  });
});
