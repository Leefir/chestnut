import { describe, it, expect } from 'vitest';
import config from '../../../.config/dependency-cruiser.cjs';

describe('dependency-cruiser: no-circular rule (phase 1306)', () => {
  it('no-circular rule present at error severity', () => {
    const rule = config.forbidden.find(
      (r: { name: string }) => r.name === 'no-circular',
    );
    expect(rule).toBeDefined();
    expect(rule.severity).toBe('error');
    expect(rule.to.circular).toBe(true);
  });
});
