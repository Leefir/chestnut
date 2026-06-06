/**
 * @phase 139 invariant test
 * Forward-defending: prevent re-introduction of src/core/shadow-system/ module path.
 * shadow is summon internal mode (phase 139 demote)、应通过 summon-system/internal/shadow/ path 访问.
 */

import { describe, test, expect } from 'vitest';
import { execSync } from 'node:child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

describe('no-shadow-system-module invariant', () => {
  test('no src file imports from core/shadow-system path', () => {
    let out = '';
    try {
      out = execSync(
        'grep -rn "shadow-system" src/ tests/',
        { encoding: 'utf-8', cwd: repoRoot }
      );
    } catch (err: any) {
      // grep exits 1 when no matches — that is the desired state
      out = err.stdout?.toString() ?? '';
    }

    // Filter: keep only lines that look like import/from statements
    const lines = out
      .split('\n')
      .filter(line => line.trim() !== '')
      .filter(line => line.includes('from') && line.includes('shadow-system'))
      // Exclude summon-system/internal/shadow (new legal path)
      .filter(line => !line.includes('summon-system/internal/shadow'))
      // Exclude this invariant test itself
      .filter(line => !line.includes('no-shadow-system-module'));

    expect(lines, `Found illegal shadow-system imports:\n${lines.join('\n')}`).toEqual([]);
  });

  test('shadow-system directory does not exist under src/core', () => {
    const fs = require('fs');
    const dirPath = path.resolve(repoRoot, 'src/core/shadow-system');
    expect(fs.existsSync(dirPath)).toBe(false);
  });
});
