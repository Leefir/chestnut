/**
 * @module L6.Assembly.InstallPaths
 * chestnut 安装根路径推算 helper（chestnutRoot + named subroot dir）。
 *
 * phase 78 自 foundation/paths.ts 迁 → L6 Assembly 真业务 owner（chestnut 安装根 +
 * 子目录路径推算 = 装配根决定）。
 *
 * cluster L1-L4 去 claw 化 / paths.ts 解散第六步、详
 * `coding plan/cluster-claw-decoupling-roadmap.md`。
 *
 * 后续 phase 79+ 处理 getWorkspaceRoot + getClawDir + getClawConfigPath + assertSafeClawId
 *（涉 crud.ts API reframe）。
 */

import * as path from 'path';
import { getWorkspaceRoot } from '../foundation/paths.js';

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
