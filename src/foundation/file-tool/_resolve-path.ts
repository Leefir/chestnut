import * as path from 'path';
import type { ExecContext } from '../tool-protocol/index.js';

/**
 * Resolve file tool path argument against workspaceDir (default) or explicit cwd.
 * Returns clawDir-relative path for ctx.fs operations + PermissionChecker.
 *
 * phase 517 / α + α.1: 默认 workspaceDir-relative / cwd 显式 override
 *
 * @param ctx ExecContext with clawDir + workspaceDir
 * @param relPath path arg from LLM (relative or absolute)
 * @param cwdArg optional cwd arg (relative to clawDir / or absolute)
 * @returns clawDir-relative resolved path（或 absolute path 跨出 clawDir 时）
 */
export function resolveWorkspacePath(
  ctx: ExecContext,
  relPath: string,
  cwdArg?: string,
): string {
  const baseDir = cwdArg
    ? path.resolve(ctx.workspaceDir, cwdArg)
    : ctx.workspaceDir;
  const absolute = path.isAbsolute(relPath)
    ? relPath
    : path.resolve(baseDir, relPath);
  return path.relative(ctx.clawDir, absolute);
}
