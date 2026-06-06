/**
 * Shared path constants + runtime path resolution — system-level directory
 * structure convention (M#3 single owner).
 *
 * foundation/paths.ts is the canonical location for all path knowledge.
 */

// ============================================================================
// phase 64: ClawId / ClawDir branded types
// 自 foundation/identity 解散迁入 paths.ts vocabulary file
// per ML#3 资源唯一归属（运行期资源 vs 架构层 vocabulary 分类澄清）
// ChestnutRoot brand → install-paths.ts (phase 84, L6 Assembly own)
// ============================================================================

declare const ClawIdBrand: unique symbol;
export type ClawId = string & { readonly [ClawIdBrand]: true };
export function makeClawId(s: string): ClawId { return s as ClawId; }

declare const ClawDirBrand: unique symbol;
export type ClawDir = string & { readonly [ClawDirBrand]: true };
export function makeClawDir(s: string): ClawDir { return s as ClawDir; }
