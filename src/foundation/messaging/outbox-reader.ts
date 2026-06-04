/**
 * OutboxReader - 单 claw outbox 读侧 + 列举
 *
 * 业主：Messaging 模块拥 outbox 资源（per architecture.md 表 1）。
 * 外部模块（如 outbox-summary）需要 outbox 状态查询时通过本 class、不直接 fs.list。
 *
 * 当前 scope：只列 pending（outbox 未消费消息）。done/failed/inflight 暂不暴露读接口、
 * caller 按需扩展。
 *
 * phase 42 NEW（前置：outbox-summary 重构、消除 MLP-3 违反）。
 */

import * as path from 'path';
import { formatErr } from '../utils/index.js';
import type { FileSystem } from '../fs/types.js';
import { isFileNotFound } from '../fs/types.js';
import type { AuditLog } from '../audit/index.js';
import { emitOutboxListFailed } from './audit-emit.js';

const OUTBOX_PENDING_SUBDIR = 'outbox/pending';

export class OutboxReader {
  constructor(
    private readonly fs: FileSystem,
    private readonly audit: AuditLog,
  ) {}

  /**
   * List `.md` filenames in `<clawDir>/outbox/pending`.
   *
   * Use case: aggregator queries (outbox-summary unread count) 不该自己 fs.list outbox。
   *
   * @param clawDir absolute path to a claw root (per ClawDir convention)
   * @returns sorted filename array (basename, not absolute path)
   *   - empty array if dir missing / list failed (silent)
   */
  async listClawOutboxPending(clawDir: string): Promise<string[]> {
    const pendingDir = path.join(clawDir, OUTBOX_PENDING_SUBDIR);
    try {
      const entries = await this.fs.list(pendingDir, { includeDirs: false });
      return entries
        .filter(e => e.name.endsWith('.md'))
        .map(e => e.name)
        .sort();
    } catch (err) {
      if (isFileNotFound(err)) return [];
      emitOutboxListFailed(this.audit, {
        dir: pendingDir,
        reason: formatErr(err),
      });
      return [];
    }
  }
}
