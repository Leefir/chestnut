/**
 * Inbox writer - write messages to inbox/pending/
 *
 * Core write operation for the Messaging module.
 * Uses FileSystem for async, atomic writes.
 */

import * as path from 'path';
import { randomUUID } from 'crypto';
import type { FileSystem } from '../fs/types.js';
import type { InboxMessage } from '../../types/messaging.js';
import { encodeInbox } from './codec-inbox.js';
import type { AuditLog } from '../audit/index.js';

/**
 * Parse YAML frontmatter (industry standard syntax / per practices.md §DRY reflex 反例落地 / phase 461)
 * 1:1 inline copy from deleted src/foundation/frontmatter/ / 各 caller 自治 / format schema 业务归 caller。
 */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  // Normalize CRLF to LF for consistent parsing
  const normalized = raw.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n')) return { meta: {}, body: raw };
  const afterOpen = normalized.slice(4);
  const closeIdx = afterOpen.indexOf('\n---\n');
  if (closeIdx < 0) {
    throw new Error('Malformed frontmatter: missing closing ---');
  }

  const meta: Record<string, string> = {};
  for (const line of afterOpen.slice(0, closeIdx).split('\n')) {
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const key = line.slice(0, ci).trim();
    const value = line.slice(ci + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = value;
  }

  // Everything after the closing --- is the body
  return { meta, body: afterOpen.slice(closeIdx + 5).trim() };
}
import { MESSAGING_AUDIT_EVENTS } from './audit-events.js';
import { ok, err as errResult, type Result } from '../../types/result.js';
import type { InboxMetaError } from './errors.js';

export type InboxMessageMeta = Record<string, string>;

export interface InboxMessageOptionsBase {
  type: string;
  source: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  body: string;
  to?: string;
  idPrefix?: string;
  filenameTag?: string;
  extraFields?: Record<string, string>;
}

export class InboxWriter {
  constructor(
    private readonly fs: FileSystem,
    private readonly inboxDir: string,
    private readonly audit: AuditLog,
  ) {}

  /** async 写，atomic */
  async write(msg: InboxMessage, extraFields?: Record<string, string>): Promise<void> {
    await this.fs.ensureDir(this.inboxDir);
    const timestamp = Date.now();
    const priority = msg.priority ?? 'normal';
    const filename = `${timestamp}_${priority}_${randomUUID().slice(0, 8)}.md`;
    const filePath = path.join(this.inboxDir, filename);
    try {
      await this.fs.writeAtomic(filePath, encodeInbox(msg, extraFields));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.audit.write(MESSAGING_AUDIT_EVENTS.INBOX_WRITE_FAILED, `file=${filename}`, `to=${msg.to ?? 'broadcast'}`, `reason=${reason}`);
      throw e;
    }
    this.audit.write(MESSAGING_AUDIT_EVENTS.INBOX_WRITTEN, `file=${filename}`, `to=${msg.to ?? 'broadcast'}`);
  }

  /** sync 写，供 task/system 同步路径使用 */
  writeSync(opts: InboxMessageOptionsBase): void {
    const now = new Date();
    const ts = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
    const uuid8 = randomUUID().slice(0, 8);
    const idPrefix = opts.idPrefix ?? opts.type;
    const tag = opts.filenameTag ?? opts.type;

    const message: InboxMessage = {
      id: `${idPrefix}-${now.getTime()}`,
      type: opts.type,
      from: opts.source,
      to: opts.to ?? '',
      content: opts.body,
      priority: opts.priority,
      timestamp: now.toISOString(),
    };

    const content = encodeInbox(message, opts.extraFields);
    this.fs.ensureDirSync(this.inboxDir);
    const filename = `${ts}_${tag}_${uuid8}.md`;
    try {
      this.fs.writeAtomicSync(path.join(this.inboxDir, filename), content);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.audit.write(MESSAGING_AUDIT_EVENTS.INBOX_WRITE_FAILED, `file=${filename}`, `to=${opts.to ?? 'broadcast'}`, `reason=${reason}`);
      throw e;
    }
    this.audit.write(MESSAGING_AUDIT_EVENTS.INBOX_WRITTEN, `file=${filename}`, `to=${opts.to ?? 'broadcast'}`);
  }

  /** 读 frontmatter meta；纯读，静态方法不依赖 audit */
  static readMeta(
    fs: FileSystem,
    filePath: string,
  ): Result<Record<string, string>, InboxMetaError> {
    let content: string;
    try {
      content = fs.readSync(filePath);
    } catch (e: any) {
      if (e?.code === 'FS_NOT_FOUND' || e?.code === 'ENOENT') {
        return errResult({ kind: 'not_found', cause: e });
      }
      return errResult({ kind: 'read_failed', cause: e });
    }
    try {
      return ok(parseFrontmatter(content).meta);
    } catch (e) {
      return errResult({ kind: 'parse_failed', cause: e });
    }
  }
}


