import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Invariant: src/foundation/fs/ 不含 chestnut 业务字面（per l1_filesystem.md §1.不做
 * 「不 own 任何 chestnut 业务概念（agent / claw / motion）」+ architecture.md L13
 * L1 = OS / 网络 / 外部 SDK 中性接口）。
 *
 * 字面集合：clawspace / claw root / clawsDir / clawsId / motion（business token、
 * 不 grep 单 `claw` 字以免 false positive 如 jsdoc 引用 "caller claw"）。
 *
 * 升档：cluster phase 65-77 去 claw 化进展、字面集合可扩；phase 77 closure 后
 * 与 dep-cruiser rule 同步 forbid 业务概念 import。
 */
describe('foundation/fs 0 chestnut business literal (phase 65)', () => {
  it('src/foundation/fs/ 无 chestnut business token', () => {
    const fsDir = 'src/foundation/fs';
    const banList = /\b(clawspace|claw\s+root|clawsDir|clawsId|motion)\b/gi;
    const hits: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
        } else if (p.endsWith('.ts')) {
          const text = readFileSync(p, 'utf8');
          const matches = text.match(banList);
          if (matches) hits.push(`${p}: ${matches.join(', ')}`);
        }
      }
    }

    walk(fsDir);
    expect(hits, `expected 0 hits but got:\n${hits.join('\n')}`).toEqual([]);
  });
});
