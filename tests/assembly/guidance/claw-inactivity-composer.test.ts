/**
 * phase 1482 + phase 2 reframe + phase 4 重写: claw-inactivity real composer unit test.
 * daemon_stopped case 已移除（归 crash_notification composer 覆盖）.
 * phase 4: guidance 字面英文化.
 */

import { describe, it, expect } from 'vitest';
import { composer } from '../../../src/assembly/guidance/composers/claw-inactivity.js';

describe('claw-inactivity composer', () => {
  it('daemon_silent → STEPS CLI (English)', () => {
    const r = composer({ failure_class: 'daemon_silent', claw_id: 'clawA' });
    expect(r).not.toBeNull();
    expect(r!.text).toContain('To inspect what the agent is stuck on: chestnut claw clawA steps');
  });

  it('daemon_errored → STEPS CLI (English)', () => {
    const r = composer({ failure_class: 'daemon_errored', claw_id: 'clawA' });
    expect(r).not.toBeNull();
    expect(r!.text).toContain('To inspect: chestnut claw clawA steps');
  });

  it('daemon_stopped → null (phase 2 移出归 crash_notification composer)', () => {
    const r = composer({ failure_class: 'daemon_stopped', claw_id: 'clawA' });
    expect(r).toBeNull();
  });

  it('unknown failure_class → null (Runtime fallback graceful)', () => {
    const r = composer({ failure_class: 'mystery_class', claw_id: 'clawA' });
    expect(r).toBeNull();
  });

  it('missing claw_id (daemon_silent) → fallback <claw-id> placeholder', () => {
    const r = composer({ failure_class: 'daemon_silent', claw_id: '' });
    expect(r!.text).toContain('chestnut claw <claw-id> steps');
  });
});
