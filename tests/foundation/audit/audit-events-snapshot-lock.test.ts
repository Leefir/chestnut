import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '../../../src');
const SNAPSHOT_PATH = path.join(SRC_ROOT, 'foundation/audit/audit-events.snapshot.json');

interface ColSchema {
  name: string;
  type: string;
  required: boolean;
  max_chars?: number;
}

interface SnapshotEntry {
  type: string;
  cols?: ColSchema[];
}

interface SnapshotJson {
  schema_version: string;
  modules: Record<string, (string | SnapshotEntry)[]>;
}

/**
 * Phase 1019 r124 E fork + phase 140 β: audit-events const 不变承诺 CI lock.
 * 任意 module 改 audit-events.ts 字符串值 → snapshot fail → PR 必同 ratify update snapshot.
 * Phase 140 Step E: snapshot.json 升 β 第 2 步，lock test 强制 tool 类 event 必填 cols。
 */
describe('audit-events snapshot lock', () => {
  it('schema_version is locked to 2.0.0 (β 第 2 步)', () => {
    const snapshot: SnapshotJson = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    expect(snapshot.schema_version).toBe('2.0.0');
  });

  it('all audit-events.ts string values match snapshot (β 兼容期)', () => {
    const actual = collectAuditEventsFromSrc(SRC_ROOT);
    const snapshot: SnapshotJson = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    const expected = parseSnapshotEvents(snapshot);
    expect(actual).toEqual(expected);
  });

  it('snapshot contains at least one {type, cols} object demo (phase 140 β)', () => {
    const snapshot: SnapshotJson = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    let found = false;
    for (const entries of Object.values(snapshot.modules)) {
      for (const entry of entries) {
        if (typeof entry === 'object' && entry !== null && 'cols' in entry) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it('tool 类 event emit 站点包含 snapshot.json 所有 required cols (β 第 2 步)', () => {
    const snapshot: SnapshotJson = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    const emitSites = collectAuditWriteEmitSites(SRC_ROOT, snapshot);

    for (const site of emitSites) {
      const eventDef = findEventInSnapshot(snapshot, site.module, site.eventType);
      if (!eventDef || !eventDef.cols) continue;

      const requiredCols = eventDef.cols.filter(c => c.required).map(c => c.name);
      for (const required of requiredCols) {
        expect(site.emittedCols).toContain(
          required,
          `${site.module}/${site.eventType} at ${site.file}:${site.line} missing required col '${required}'`,
        );
      }
    }
  });

  it('reverse: synthetic source with unauthorized const diverges from snapshot', () => {
    const syntheticSource = `
      export const FAKE_AUDIT_EVENTS = {
        LEGIT_EVENT: 'legit_event',
        UNAUTHORIZED_FAKE: 'unauthorized_fake_event',
      } as const;
    `;
    const matches = Array.from(syntheticSource.matchAll(/[A-Z_][A-Z0-9_]*:\s*'([a-z0-9_]+)'/g));
    const syntheticEvents = matches.map(m => m[1]);
    expect(syntheticEvents).toContain('unauthorized_fake_event');
    const snapshot: SnapshotJson = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    const allLegitEvents = Object.values(snapshot.modules)
      .flat()
      .map(e => (typeof e === 'string' ? e : e.type)) as string[];
    expect(allLegitEvents).not.toContain('unauthorized_fake_event');
    expect(syntheticEvents).not.toEqual(allLegitEvents);
  });
});

function parseSnapshotEvents(snapshot: SnapshotJson): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [moduleName, entries] of Object.entries(snapshot.modules)) {
    result[moduleName] = entries.map(e => (typeof e === 'string' ? e : e.type)).sort();
  }
  return result;
}

function findEventInSnapshot(
  snapshot: SnapshotJson,
  moduleName: string,
  eventType: string,
): SnapshotEntry | undefined {
  const entries = snapshot.modules[moduleName];
  if (!entries) return undefined;
  for (const entry of entries) {
    if (typeof entry === 'object' && entry.type === eventType) {
      return entry;
    }
  }
  return undefined;
}

interface EmitSite {
  file: string;
  module: string;
  eventType: string;
  line: number;
  emittedCols: string[];
}

/**
 * Scan source files for audit write calls that emit events defined in snapshot.json with cols.
 *
 * Heuristic: find lines matching `.write(EVENT_CONST, ...)` or `.write('event_type', ...)`
 * and extract `key=` patterns from the arguments.
 */
function collectAuditWriteEmitSites(root: string, snapshot: SnapshotJson): EmitSite[] {
  const result: EmitSite[] = [];
  const eventsWithCols = new Set<string>();
  for (const entries of Object.values(snapshot.modules)) {
    for (const entry of entries) {
      if (typeof entry === 'object' && entry.cols && entry.cols.length > 0) {
        eventsWithCols.add(entry.type);
      }
    }
  }

  walk(root, (file) => {
    if (!file.endsWith('.ts')) return;
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const moduleName = path.relative(root, file).replace(/\.ts$/, '').replace(/\//g, '_');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match audit.write( or .auditWriter.write( or opts.audit.write( etc.
      const match = line.match(/(\w+\.)?write\s*\(\s*([^,]+)(?:,\s*(.*))?\)/);
      if (!match) continue;
      const argsStr = match[2] + (match[3] ? ', ' + match[3] : '');

      // Resolve event type: either a const identifier or a string literal
      const eventArg = match[2].trim();
      let eventType: string | undefined;
      if (/^['"]/.test(eventArg)) {
        eventType = eventArg.slice(1, -1).replace(/['"]/g, '');
      } else if (eventArg.includes('_AUDIT_EVENTS.')) {
        const constName = eventArg.split('.').pop();
        // Look up the string value in the same file (heuristic)
        const constMatch = content.match(new RegExp(`${constName}\\s*:\s*['\"]([a-z0-9_]+)['\"]`));
        if (constMatch) eventType = constMatch[1];
      } else if (/^[A-Z][A-Z0-9_]*$/.test(eventArg)) {
        // Direct const reference like SUBAGENT_AUDIT_EVENTS.TOOL_RESULT but without dot
        const constMatch = content.match(new RegExp(`${eventArg}\s*:\s*['\"]([a-z0-9_]+)['\"]`));
        if (constMatch) eventType = constMatch[1];
      }

      if (!eventType || !eventsWithCols.has(eventType)) continue;

      // Extract key= patterns from arguments (best-effort)
      const emittedCols: string[] = [];
      const colMatches = argsStr.matchAll(/([a-z_][a-z0-9_]*)\s*=/g);
      for (const m of colMatches) {
        emittedCols.push(m[1]);
      }

      result.push({ file, module: moduleName, eventType, line: i + 1, emittedCols });
    }
  });
  return result;
}

function collectAuditEventsFromSrc(root: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  walk(root, (file) => {
    if (!file.endsWith('audit-events.ts')) return;
    const content = fs.readFileSync(file, 'utf-8');
    const matches = Array.from(content.matchAll(/[A-Z_][A-Z0-9_]*:\s*'([a-z0-9_]+)'/g));
    if (matches.length > 0) {
      const moduleName = path.relative(root, file).replace(/\.ts$/, '').replace(/\//g, '_');
      result[moduleName] = matches.map(m => m[1]).sort();
    }
  });
  return result;
}

function walk(dir: string, cb: (file: string) => void) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else if (entry.isFile()) cb(full);
  }
}
