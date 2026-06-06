/**
 * @module L2.AuditLog
 * AuditLog reader API (L2)
 *
 * 审计日志只读接口。与 writer.ts 解耦、独立文件。
 * 消费者：CLI query/info subcommand（本 phase Step B/C）。
 *
 * Invariants:
 * - reader 不 emit audit event（read-only、ML 5）
 * - reader 不知业务语义（cols 透传 string[]）
 * - 坏行 stderr warn + skip + continue（DP「不静默忽略」）
 * - follow rotation handover 不丢 row
 */

import * as path from 'path';
import { tmpdir } from 'node:os';
import * as nodeFs from 'node:fs';
import type { FileSystem } from '../fs/types.js';

/** Compile-time brand field — prevents structural matching of mocks. */
export interface AuditReader {
  readonly __brand: 'AuditReader';

  /**
   * Read records matching opts. Single-shot iteration.
   * Malformed rows → stderr warn + skip + continue.
   */
  read(opts?: ReadOptions): AsyncIterableIterator<AuditRecord>;

  /**
   * Follow file: yield existing records, then watch for new appends.
   * Handles rotation transparently.
   * Caller terminates via close() or SIGINT.
   */
  follow(opts?: ReadOptions): AsyncIterableIterator<AuditRecord>;

  /** Stop active follow watcher. Idempotent. */
  close(): void;
}

export interface AuditRecord {
  ts: string;
  seq: number;
  type: string;
  cols: readonly string[];
  trace_id?: string;
}

export interface ReadOptions {
  fromSeq?: number;
  toSeq?: number;
  sinceTs?: string;
  untilTs?: string;
  typePattern?: string;
  colFilter?: Readonly<Record<string, string>>;
  traceId?: string;
  limit?: number;
}

export interface AuditFileInfo {
  name: string;
  path: string;
  isBusinessMain: boolean;
}

export interface PendingFallbackDump {
  path: string;
  pid: number;
  ts: number;
  size: number;
}

/** Factory: new reader bound to a file path. */
export function createAuditReader(fs: FileSystem, filePath: string): AuditReader {
  let closed = false;
  let watcher: ReturnType<typeof setInterval> | null = null;

  async function *read(opts: ReadOptions = {}): AsyncIterableIterator<AuditRecord> {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readSync(filePath);
    yield* parseContent(content, opts);
  }

  async function *follow(opts: ReadOptions = {}): AsyncIterableIterator<AuditRecord> {
    if (closed) return;

    let currentPath = filePath;
    let lastSize = 0;
    let yielded = 0;
    const limit = opts.limit;

    // Initial state: read existing content if file exists
    if (fs.existsSync(currentPath)) {
      const stat = fs.statSync(currentPath);
      lastSize = stat.size;
      if (opts.fromSeq !== undefined || opts.sinceTs !== undefined) {
        // Filtered read of existing content
        for await (const rec of read(opts)) {
          if (closed) return;
          yield rec;
          yielded++;
          if (limit !== undefined && yielded >= limit) return;
        }
      } else {
        // Skip existing content when no fromSeq/sinceTs — start from EOF
      }
    }

    // Polling loop
    while (!closed) {
      await sleep(100);
      if (closed) return;

      if (!fs.existsSync(currentPath)) {
        continue;
      }

      const stat = fs.statSync(currentPath);
      const currentSize = stat.size;

      if (currentSize < lastSize) {
        // File shrunk or rotated: check for .bak
        const dir = path.dirname(currentPath);
        const base = path.basename(currentPath);
        const bakPath = path.join(dir, `${base}.bak`);
        if (fs.existsSync(bakPath)) {
          // Rotation: read tail of .bak if any, then switch to new file
          const bakStat = fs.statSync(bakPath);
          if (bakStat.size > lastSize) {
            const bakContent = fs.readSync(bakPath);
            const tail = bakContent.slice(lastSize);
            for (const rec of parseChunk(tail, opts)) {
              if (closed) return;
              yield rec;
              yielded++;
              if (limit !== undefined && yielded >= limit) return;
            }
          }
        }
        // Reset to new file beginning (or EOF if we only want new appends)
        lastSize = 0;
        // Re-read from start to catch any new content
        if (currentSize > 0) {
          const content = fs.readSync(currentPath);
          const chunk = content.slice(0, currentSize);
          for (const rec of parseChunk(chunk, opts)) {
            if (closed) return;
            yield rec;
            yielded++;
            if (limit !== undefined && yielded >= limit) return;
          }
          lastSize = currentSize;
        }
        continue;
      }

      if (currentSize > lastSize) {
        const content = fs.readSync(currentPath);
        const chunk = content.slice(lastSize, currentSize);
        for (const rec of parseChunk(chunk, opts)) {
          if (closed) return;
          yield rec;
          yielded++;
          if (limit !== undefined && yielded >= limit) return;
        }
        lastSize = currentSize;
      }
    }
  }

  function close(): void {
    closed = true;
    if (watcher) {
      clearInterval(watcher);
      watcher = null;
    }
  }

  return {
    __brand: 'AuditReader' as const,
    read,
    follow,
    close,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function *parseContent(content: string, opts: ReadOptions): Generator<AuditRecord> {
  const lines = content.split('\n');
  let yielded = 0;
  for (const line of lines) {
    if (!line) continue;
    const rec = parseLine(line);
    if (!rec) continue;
    if (!matchesOpts(rec, opts)) continue;
    yield rec;
    yielded++;
    if (opts.limit !== undefined && yielded >= opts.limit) return;
  }
}

function *parseChunk(chunk: string, opts: ReadOptions): Generator<AuditRecord> {
  // chunk may start in the middle of a line; skip to first newline unless at start
  let start = 0;
  if (chunk.length > 0 && chunk[0] !== '\n' && !chunk.startsWith('20')) {
    // Heuristic: if chunk doesn't start with a timestamp (beginning with '20' for 20xx),
    // skip to first newline to avoid partial line
    const firstNl = chunk.indexOf('\n');
    if (firstNl === -1) return; // no complete line
    start = firstNl + 1;
  }
  const lines = chunk.slice(start).split('\n');
  let yielded = 0;
  for (const line of lines) {
    if (!line) continue;
    const rec = parseLine(line);
    if (!rec) continue;
    if (!matchesOpts(rec, opts)) continue;
    yield rec;
    yielded++;
    if (opts.limit !== undefined && yielded >= opts.limit) return;
  }
}

function parseLine(line: string): AuditRecord | null {
  const parts = line.split('\t');
  if (parts.length < 3) {
    process.stderr.write(`[audit-reader] malformed row skipped: ${line.slice(0, 80)}\n`);
    return null;
  }
  const ts = parts[0];
  if (!parts[1].startsWith('seq=')) {
    process.stderr.write(`[audit-reader] missing seq col: ${line.slice(0, 80)}\n`);
    return null;
  }
  const seq = parseInt(parts[1].slice(4), 10);
  if (Number.isNaN(seq)) {
    process.stderr.write(`[audit-reader] invalid seq: ${line.slice(0, 80)}\n`);
    return null;
  }
  const type = unesc(parts[2]);
  const restCols = parts.slice(3).map(unesc);

  let traceId: string | undefined;
  if (restCols.length > 0 && restCols[restCols.length - 1].startsWith('trace_id=')) {
    traceId = restCols[restCols.length - 1].slice(9);
    restCols.pop();
  }

  return { ts, seq, type, cols: Object.freeze(restCols), trace_id: traceId };
}

function matchesOpts(rec: AuditRecord, opts: ReadOptions): boolean {
  if (opts.fromSeq !== undefined && rec.seq < opts.fromSeq) return false;
  if (opts.toSeq !== undefined && rec.seq > opts.toSeq) return false;
  if (opts.sinceTs && rec.ts < opts.sinceTs) return false;
  if (opts.untilTs && rec.ts > opts.untilTs) return false;
  if (opts.typePattern && !globMatch(rec.type, opts.typePattern)) return false;
  if (opts.traceId && rec.trace_id !== opts.traceId) return false;
  if (opts.colFilter) {
    for (const [key, val] of Object.entries(opts.colFilter)) {
      const needle = `${key}=${val}`;
      if (!rec.cols.some(c => c.includes(needle))) return false;
    }
  }
  return true;
}

function globMatch(s: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );
  return regex.test(s);
}

/** Reverse of esc() from _helpers.ts */
function unesc(s: string): string {
  return s
    .replace(/\\0/g, '\0')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

/** List audit files at baseDir. */
export function listAuditFiles(fs: FileSystem, baseDir: string): AuditFileInfo[] {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.listSync(baseDir);
  const results: AuditFileInfo[] = [];
  for (const e of entries) {
    if (!e.name.endsWith('.tsv')) continue;
    if (e.name.includes('.bak')) continue;
    const name = e.name.slice(0, -4);
    results.push({
      name,
      path: path.join(baseDir, e.name),
      isBusinessMain: name === 'audit',
    });
  }
  // Sort: business main first, then alphabetical
  results.sort((a, b) => {
    if (a.isBusinessMain && !b.isBusinessMain) return -1;
    if (!a.isBusinessMain && b.isBusinessMain) return 1;
    return a.name.localeCompare(b.name);
  });
  return results;
}

/** Detect pending fallback dump files at OS tmpdir. */
export function listPendingFallbackDumps(): PendingFallbackDump[] {
  const tmp = tmpdir();
  const pattern = /^chestnut-audit-fallback-(\d+)-(\d+)\.tsv$/;
  let entries: string[];
  try {
    entries = nodeFs.readdirSync(tmp);
  } catch {
    return [];
  }
  const results: PendingFallbackDump[] = [];
  for (const name of entries) {
    const m = name.match(pattern);
    if (!m) continue;
    const fullPath = path.join(tmp, name);
    try {
      const stat = nodeFs.statSync(fullPath);
      results.push({
        path: fullPath,
        pid: parseInt(m[1], 10),
        ts: parseInt(m[2], 10),
        size: stat.size,
      });
    } catch { /* silent: race condition, file may disappear between readdir and stat */ }
  }
  return results;
}
