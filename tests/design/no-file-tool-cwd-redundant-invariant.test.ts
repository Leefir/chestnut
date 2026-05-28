import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('phase 1390: read/write/ls/edit/multi_edit 不再含 cwd schema field', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const TOOLS = ['read', 'write', 'ls', 'edit', 'multi_edit'];

  it('5 file tool schema 0 cwd field', () => {
    for (const tool of TOOLS) {
      const file = readFileSync(`${ROOT}/src/foundation/file-tool/${tool}.ts`, 'utf-8');
      // match a property declaration `  cwd: {` at line start with indent
      expect(file).not.toMatch(/^\s+cwd:\s*\{/m);
    }
  });

  it('5 file tool execute 0 cwdArg 解构', () => {
    for (const tool of TOOLS) {
      const file = readFileSync(`${ROOT}/src/foundation/file-tool/${tool}.ts`, 'utf-8');
      expect(file).not.toMatch(/args\.cwd\s+as\s+string/);
      expect(file).not.toMatch(/const\s+cwdArg\s*=/);
    }
  });

  it('search + exec 仍含 cwd schema (sanity / regression-guard)', () => {
    const search = readFileSync(`${ROOT}/src/foundation/file-tool/search.ts`, 'utf-8');
    const exec = readFileSync(`${ROOT}/src/foundation/command-tool/exec.ts`, 'utf-8');
    expect(search).toMatch(/^\s+cwd:\s*\{/m);
    expect(exec).toMatch(/^\s+cwd:\s*\{/m);
  });

  it('反向自检 — sample 含 cwd field 应被命中', () => {
    const sample = `  schema: {\n    properties: {\n      cwd: { type: 'string' },\n      path: ...\n    }\n  }`;
    expect(/^\s+cwd:\s*\{/m.test(sample)).toBe(true);
  });
});
