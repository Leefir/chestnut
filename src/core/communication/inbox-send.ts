/**
 * Inbox message sending — write a message file to a claw's inbox/pending/.
 *
 * Messaging (L2) logic,
 * temporarily in core/communication/ until the Messaging module is created.
 */

import * as path from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import type { InboxMessage } from '../../types/contract.js';
import { writeAtomic } from '../../foundation/fs/atomic.js';
import { encodeInbox } from '../../foundation/message-codec/index.js';

/**
 * Send a message to a claw's inbox.
 *
 * @param workspaceDir — workspace root (e.g. ~/.clawforum/), claws live under {workspaceDir}/claws/
 * @param clawId — target claw identifier
 * @param msg — message to deliver
 */
export async function sendInboxMessage(
  workspaceDir: string,
  clawId: string,
  msg: InboxMessage,
): Promise<void> {
  // 校验目标 claw 目录存在（claws/{clawId}/ 本身应由 claw create 命令创建）
  const clawDir = path.join(workspaceDir, 'claws', clawId);
  try {
    const stat = await fs.stat(clawDir);
    if (!stat.isDirectory()) {
      throw new Error(`"${clawId}" is not a directory`);
    }
  } catch (err: any) {
    if (err?.code === 'ENOENT' || err?.message?.includes('not a directory')) {
      throw new Error(`Claw "${clawId}" does not exist, message not delivered`);
    }
    throw err;
  }

  const pendingDir = path.join(clawDir, 'inbox', 'pending');
  await fs.mkdir(pendingDir, { recursive: true });

  const timestamp = Date.now();
  const priority = msg.priority ?? 'normal';
  const filename = `${timestamp}_${priority}_${randomUUID().slice(0, 8)}.md`;
  const filePath = path.join(pendingDir, filename);

  await writeAtomic(filePath, encodeInbox(msg));
}
