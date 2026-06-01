/**
 * phase 2 γ4 + phase 4 重写: crash-notification real composer unit test.
 */

import { describe, it, expect } from 'vitest';
import { composer } from '../../../src/assembly/guidance/composers/crash-notification.js';

describe('crash-notification composer', () => {
  it('active_unexpected → 2-line guidance: restart + diagnostic CLI (phase 4)', () => {
    const r = composer({ crash_class: 'active_unexpected', claw_id: 'clawA' });
    expect(r).not.toBeNull();
    expect(r!.text).toContain('To restart: chestnut claw clawA daemon');
    expect(r!.text).toContain('To inspect what the claw was doing before crash: chestnut claw clawA steps');
  });

  it('active_user_stopped → null FYI (motion 知情即可)', () => {
    const r = composer({ crash_class: 'active_user_stopped', claw_id: 'clawA' });
    expect(r).toBeNull();
  });

  it('unknown crash_class → null fallback', () => {
    const r = composer({ crash_class: 'mystery', claw_id: 'clawA' });
    expect(r).toBeNull();
  });

  it('missing claw_id → fallback <claw-id> placeholder', () => {
    const r = composer({ crash_class: 'active_unexpected', claw_id: '' });
    expect(r!.text).toContain('chestnut claw <claw-id> daemon');
    expect(r!.text).toContain('chestnut claw <claw-id> steps');
  });
});
