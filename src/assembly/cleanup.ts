/**
 * @module L6.Assembly
 * 启动期临时残片清理（A.p320-2 / phase397）
 *
 * 启动期一次性清理 .tmp_* 残片 / 装配方副作用 / 不在 L1 fs OS 原语层。
 * 历史：phase397 物理迁 src/foundation/fs/atomic.ts → src/assembly/cleanup.ts。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { IGNORE_PATTERN } from '../foundation/fs/atomic.js';

export async function cleanupOrphanedTemp(dirPath: string): Promise<string[]> {
  const cleaned: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.startsWith(IGNORE_PATTERN)) continue;
      if (!entry.isFile()) continue;
      const fullPath = path.join(dirPath, entry.name);
      try {
        await fs.unlink(fullPath);
        cleaned.push(fullPath);
      } catch {
        // best-effort: caller (assembly) handles overall failure via .catch(audit)
      }
    }
  } catch {
    // Directory might not exist
  }
  return cleaned;
}
