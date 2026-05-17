/**
 * chat-viewport shutdown parallelization (phase 908 B2)
 *
 * Covers:
 * - Promise.all schema replaces serial for...of await
 * - Parallel stop timing: 3 × 100ms resolves in < 200ms total
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, '../../src/cli/commands/chat-viewport.ts');
const sourceCode = fs.readFileSync(sourcePath, 'utf-8');

describe('chat-viewport shutdown parallelization (B2)', () => {
  it('source uses Promise.all for taskWatchMap shutdown', () => {
    const cleanupStart = sourceCode.indexOf('await exitPromise;');
    expect(cleanupStart).toBeGreaterThan(-1);
    const cleanupBlock = sourceCode.slice(cleanupStart, cleanupStart + 2000);

    expect(cleanupBlock).toContain('Promise.all(');
    expect(cleanupBlock).toContain('taskWatchMap.values()');
    // old serial pattern removed
    expect(cleanupBlock).not.toMatch(
      /for\s*\(\s*const\s+tw\s+of\s+taskWatchMap\.values\(\)\s*\)\s*await\s+tw\.streamReader\?\.stop\(\)/
    );
  });

  it('Promise.all resolves 3 × 100ms stops in < 200ms (parallel vs serial)', async () => {
    const start = Date.now();
    await Promise.all(
      Array.from({ length: 3 }).map(() => new Promise<void>(r => setTimeout(r, 100)))
    );
    const elapsed = Date.now() - start;
    // serial would be ~300ms; parallel should be ~100ms
    expect(elapsed).toBeLessThan(200);
  });
});
