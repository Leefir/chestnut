import { describe, it, expect } from 'vitest';
import config from '../../../.config/dependency-cruiser.cjs';

describe('dependency-cruiser: no-circular rule (phase 1306 / phase 1308 transition)', () => {
  it('no-circular rule present at warn severity (phase 1308 transition / phase 1313+ 升 error)', () => {
    const rule = config.forbidden.find(
      (r: { name: string }) => r.name === 'no-circular',
    );
    expect(rule).toBeDefined();
    // phase 1308 transition: severity 'warn' (临时 / 当前 48 unique cycle / cleanup roadmap phase 1309-1313)
    expect(rule.severity).toBe('warn');
    expect(rule.to.circular).toBe(true);
  });
});
