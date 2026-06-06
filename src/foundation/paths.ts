/**
 * Shared path constants + runtime path resolution — system-level directory
 * structure convention (M#3 single owner).
 *
 * foundation/paths.ts is the canonical location for all path knowledge.
 */

import * as path from 'path';

// ============================================================================
// phase 64: ClawId / ClawDir / ChestnutRoot branded types + resolveChestnutRoot
// 自 foundation/identity 解散迁入 paths.ts vocabulary file
// per ML#3 资源唯一归属（运行期资源 vs 架构层 vocabulary 分类澄清）
// ============================================================================

declare const ClawIdBrand: unique symbol;
export type ClawId = string & { readonly [ClawIdBrand]: true };
export function makeClawId(s: string): ClawId { return s as ClawId; }

declare const ClawDirBrand: unique symbol;
export type ClawDir = string & { readonly [ClawDirBrand]: true };
export function makeClawDir(s: string): ClawDir { return s as ClawDir; }

declare const ChestnutRootBrand: unique symbol;
export type ChestnutRoot = string & { readonly [ChestnutRootBrand]: true };
export function makeChestnutRoot(s: string): ChestnutRoot { return s as ChestnutRoot; }

/**
 * 从 clawDir 推算 chestnutRoot 的单一权威函数。
 *
 * 目录拓扑（design/architecture.md 系统拓扑节）：
 *   motion claw：`<root>/motion/`         → motion claw clawDir 的父 = root
 *   普通 claw： `<root>/claws/<id>/`     → 普通 claw clawDir 的祖父 = root
 *
 * 调用方需告知是否 motion（来自 Assembly 装配期 isMotion guard）。
 *
 * 本函数是 phase 1387/1388/1389 cluster 反复 fix 的实然终结点：
 * 所有 `path.join(*, '..')` 推算 chestnutRoot 必经此函数（lint enforce 推 Step Z）。
 *
 * @param clawDir 此 claw 的实例目录（branded ClawDir）
 * @param isMotion 是否 motion claw（拓扑差异由配置决定 / 非模块差异）
 * @returns branded ChestnutRoot
 */
export function resolveChestnutRoot(clawDir: ClawDir, isMotion: boolean): ChestnutRoot {
  return isMotion
    ? makeChestnutRoot(path.join(clawDir, '..'))  // Motion-only callsite: motion clawDir = <root>/motion → root
    : makeChestnutRoot(path.join(clawDir, '..', '..'));
}
