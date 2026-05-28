import { beforeEach } from 'vitest';
import { _resetVerificationMutexForTest } from '../src/core/contract/verification-mutex.js';

beforeEach(() => {
  _resetVerificationMutexForTest();
});
