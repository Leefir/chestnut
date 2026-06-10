/**
 * Phase 223 — ENOENT-only check invariant
 *
 * 守 src/ 内 0 处 `code === 'ENOENT'` 或 `code !== 'ENOENT'` 字面
 * （除 helper 自身 + 真业务 allow-list）
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { isFileNotFound, FileNotFoundError } from '../../../src/foundation/fs/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ENOENT-only check invariant (phase 223)', () => {
  it('src/ 内 0 处 `code === \'ENOENT\'` 或 `code !== \'ENOENT\'` 字面（除 helper 自身 + 真业务 allow-list）', () => {
    const SRC_ROOT = path.resolve(__dirname, '../../../src');

    // allow-list (真业务 ENOENT 字面 / 非 fs 抽象 caller / 已 align 双 code check)
    const ALLOW = [
      'foundation/fs/types.ts',                  // isFileNotFound helper 自身
      'foundation/fs/node-fs.ts',                // node fs 抽象 raw catch
      'foundation/fs/atomic.ts',                 // fs 抽象内部
      'foundation/snapshot/git-errors.ts',       // UNEXPECTED_ERRNO set 业务字面
      'foundation/transport/unix-socket.ts',     // ECONNREFUSED / ENOTSOCK 业务 union
      'foundation/process-exec/process-starttime.ts', // ps binary missing 业务字面
      'foundation/process-exec/find-by-pattern.ts',   // 业务字面
      'foundation/messaging/inbox-reader.ts',    // 已 align 双 code check / 业务字面
      'foundation/messaging/inbox-writer.ts',    // 已 align 双 code check
      'foundation/audit/writer.ts',              // 已 align 双 code check
      'foundation/audit/batched-writer.ts',      // 业务字面
      'foundation/dialog-store/restore.ts',      // 已 align 双 code check
      'foundation/dialog-store/store.ts',        // 已 align 双 code check
      'foundation/process-manager/alive.ts',     // 已 align 双 code check
      'foundation/process-manager/lock.ts',      // 已 align 双 code check
      'foundation/process-manager/pid.ts',       // 已 align 双 code check
      'foundation/process-manager/ready.ts',     // 已 align 双 code check
      'foundation/process-manager/spawn.ts',     // 已 align 双 code check
      'core/evolution-system/system.ts',         // 已改 261 行 / 128+223 已 align 双 code check
      'core/contract/lock.ts',                   // 已 align 双 code check
      'core/runtime/runtime.ts',                 // 已 align 双 code check
      'core/status-service/aggregators.ts',      // 已 align 双 code check
      'core/async-task-system/system.ts',        // 已 align 双 code check
      'cli/commands/claw-health.ts',             // 业务字面
      'cli/commands/claw-outbox.ts',             // 业务字面
      'cli/commands/claw-trace.ts',              // 业务字面
      'daemon/daemon-loop.ts',                   // 已 align 双 code check
      'watchdog/watchdog-utils.ts',              // 已 align 双 code check
    ];

    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
            walk(full);
          }
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
          const rel = path.relative(SRC_ROOT, full);
          if (ALLOW.some(a => rel === a || rel.endsWith('/' + a))) continue;
          const content = fs.readFileSync(full, 'utf-8');
          // 检 `code === 'ENOENT'` 或 `code !== 'ENOENT'` 字面（直接 ENOENT 比较 = 漂）
          if (/code\s*[!=]==\s*['"]ENOENT['"]/.test(content)) {
            hits.push(rel);
          }
        }
      }
    };

    walk(SRC_ROOT);
    expect(hits).toEqual([]);
  });

  it('isFileNotFound helper 正确识别 chestnut FileNotFoundError + node ENOENT', () => {
    expect(isFileNotFound(new FileNotFoundError('test'))).toBe(true);
    const enoentErr = new Error('ENOENT') as NodeJS.ErrnoException;
    enoentErr.code = 'ENOENT';
    expect(isFileNotFound(enoentErr)).toBe(true);
    expect(isFileNotFound({ code: 'EACCES' })).toBe(false);
    expect(isFileNotFound(new Error('random'))).toBe(false);
    expect(isFileNotFound(null)).toBe(false);
    expect(isFileNotFound(undefined)).toBe(false);
  });
});
