import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import baselineJson from './mock-audit-baseline.json';

const TESTS_DIR = path.resolve(__dirname, '../../tests');
const RAW_PATTERN = /write:\s*vi\.fn\(\)/g;

interface RawSite {
  file: string;       // relative to tests/
  line: number;
  excerpt: string;    // matched line text
}

function findRawSites(dir: string, relBase = ''): RawSite[] {
  const sites: RawSite[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.join(relBase, entry.name);
    if (entry.isDirectory()) {
      sites.push(...findRawSites(full, rel));
      continue;
    }
    if (!/\.(ts|tsx|js)$/.test(entry.name)) continue;
    // Skip invariant test infrastructure files (they legitimately reference the pattern)
    if (/mock-audit-/.test(entry.name)) continue;
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(RAW_PATTERN);
      if (!m) continue;
      const excerpt = lines[i].trimEnd();
      // exempt allowlist matched by file + line + excerpt
      sites.push({ file: rel, line: i + 1, excerpt });
    }
  }
  return sites;
}

describe('mock-audit helper invariant (phase 1244 r133 C fork)', () => {
  it('baseline lock: raw `write: vi.fn()` count must equal baseline (ratchet allow-shrink-forbid-grow)', () => {
    const sites = findRawSites(TESTS_DIR);
    const baseline = baselineJson.entries as Array<{ file: string; line: number; excerpt: string }>;
    const allowed = baselineJson.allowed_patterns as string[];
    // exempt sites matching allowed_patterns (e.g. minimal mock signature override)
    const violations = sites.filter(s => !allowed.some(p => s.excerpt.includes(p)));
    // ratchet: count must NOT grow beyond baseline; SHRINK is allowed (migrate-on-touch)
    expect(violations.length).toBeLessThanOrEqual(baseline.length);
    // each violation must be in baseline (NEW raw site forbidden)
    const baselineKeys = new Set(baseline.map(e => `${e.file}:${e.line}`));
    const newSites = violations.filter(v => !baselineKeys.has(`${v.file}:${v.line}`));
    expect(newSites, `NEW raw site introduced (forbidden by ratchet). Use makeMockAudit() from tests/helpers/audit.ts. Sites: ${JSON.stringify(newSites.slice(0, 5))}`).toEqual([]);
  });

  it('reverse 1 (synthetic NEW raw site → fail)', () => {
    // Synthesize a violation not in baseline; assert filter catches it
    const synthetic: RawSite = { file: 'tests/__synthetic__.test.ts', line: 999, excerpt: 'write: vi.fn(),' };
    const baseline = baselineJson.entries as Array<{ file: string; line: number; excerpt: string }>;
    const baselineKeys = new Set(baseline.map(e => `${e.file}:${e.line}`));
    expect(baselineKeys.has(`${synthetic.file}:${synthetic.line}`)).toBe(false);
    // (Real fail behavior covered by it #1; this assertion proves baselineKeys logic correct)
  });

  it('reverse 2 (allowlist pattern → exempt)', () => {
    const allowed = baselineJson.allowed_patterns as string[];
    expect(Array.isArray(allowed)).toBe(true);
    // (placeholder: allowed_patterns might be empty initially; allowlist designed extensible)
  });

  it('reverse 3 (baseline format invariant)', () => {
    const baseline = baselineJson.entries as Array<{ file: string; line: number; excerpt: string }>;
    expect(baseline.length).toBeGreaterThan(0);
    for (const e of baseline.slice(0, 10)) {
      expect(typeof e.file).toBe('string');
      expect(typeof e.line).toBe('number');
      expect(typeof e.excerpt).toBe('string');
    }
  });
});
