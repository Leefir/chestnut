/**
 * @module L6.Assembly.InstallPaths
 * chestnut 安装根 + 子目录 + claw 实例路径推算 + claw id 校验。
 *
 * phase 78 加 getChestnutRoot + getNamedSubrootDir、phase 81 加 getWorkspaceRoot +
 * assertSafeClawId（private） + getClawDir + getClawConfigPath、自 foundation/paths.ts
 * 整迁 → L6 Assembly 真业务 owner（chestnut 安装根 = 装配根决定）。
 *
 * cluster L1-L4 去 claw 化 / paths.ts 解散第六-七步、详
 * `coding plan/cluster-claw-decoupling-roadmap.md`。
 *
 * Claw* brand + factory + resolveChestnutRoot 仍 paths.ts、phase 82+ cluster 处理
 *（200+ caller、大 cluster）；import ClawDir type-only = L6 → L1 合规过渡。
 */

import * as path from 'path';
import { type ClawDir, makeClawDir } from '../foundation/paths.js';

/** Workspace root — prefers CHESTNUT_ROOT env var (inherited by exec child processes). */
export function getWorkspaceRoot(): string {
  return process.env.CHESTNUT_ROOT ?? process.cwd();
}

export function getChestnutRoot(): string {
  return path.join(getWorkspaceRoot(), '.chestnut');
}

/**
 * Generic helper to get a named subroot dir under .chestnut/.
 *
 * @param name - subroot name (caller-owned, e.g., motion, claws)
 */
export function getNamedSubrootDir(name: string): string {
  return path.join(getWorkspaceRoot(), '.chestnut', name);
}

/**
 * Validate identifier-class param (clawId / skillName / etc) against traversal.
 * @throws Error if name contains '/', '..', is empty, '.' or starts with '.'.
 * Private (internal use by getClawDir only).
 */
function assertSafeClawId(name: string): void {
  if (
    typeof name !== 'string' ||
    name === '' ||
    name === '.' ||
    name.startsWith('.') ||
    name.includes('/') ||
    name.includes('\\') ||
    /[\x00-\x1f]/.test(name) ||
    name.includes('..')
  ) {
    throw new Error(`Invalid claw id: ${JSON.stringify(name)}`);
  }
}

export function getClawDir(name: string): ClawDir {
  assertSafeClawId(name);
  return makeClawDir(path.join(getWorkspaceRoot(), '.chestnut', 'claws', name));
}

export function getClawConfigPath(name: string): string {
  return path.join(getClawDir(name), 'config.yaml');
}
