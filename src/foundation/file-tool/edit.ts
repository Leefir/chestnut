/**
 * @module L2.FileTool
 * edit tool - Replace exact string in a file
 *
 * Features:
 * - Unique match by default (multiple matches reject unless replace_all=true)
 * - 0 match fail loud with hint
 * - Backup to syncDir with frontmatter
 * - Atomic write (temp+rename)
 * - File must exist (use write to create)
 */

import type { Tool, ExecContext } from '../tools/index.js';
import type { ToolResult } from '../tool-protocol/index.js';

import { backupToSync } from './sync-backup.js';
import { resolveWorkspacePath } from './resolve-path.js';
import { computeContentHash } from './file-state.js';
export const EDIT_TOOL_NAME = 'edit' as const;

function countMatches(s: string, pattern: string): number {
  if (!pattern) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = s.indexOf(pattern, pos)) !== -1) {
    count++;
    pos += pattern.length;
  }
  return count;
}

export const editTool: Tool = {
  name: EDIT_TOOL_NAME,
  profiles: ['full', 'subagent', 'miner'],
  group: 'fs-write',
  description: 'Edit a file by exact string replace. Path is relative to clawspace (do NOT prefix with "clawspace/"). Use "../" in path to access claw root files. old_string must uniquely match by default; use replace_all=true for batch. File must exist.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path (relative to clawspace, with "../" allowed for claw root access)',
      },
      old_string: {
        type: 'string',
        description: 'Exact string to replace (must uniquely match by default)',
      },
      new_string: {
        type: 'string',
        description: 'Replacement string',
      },
      replace_all: {
        type: 'boolean',
        description: 'If true, replace all occurrences instead of just the first',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  readonly: false,
  idempotent: false,

  async execute(args: Record<string, unknown>, ctx: ExecContext): Promise<ToolResult> {
    const filePath = args.path as string;
    const oldString = args.old_string as string;
    const newString = args.new_string as string;
    const replaceAll = args.replace_all === true;

    const resolved = resolveWorkspacePath(ctx, filePath);
    if (resolved.startsWith('..') || resolved.startsWith('/')) {
      return {
        success: false,
        content: `Error: Path escapes claw root: "${filePath}"`,
      };
    }

    // Phase430: claw-space boundary check — caller autonomy
    const checker = ctx.permissionChecker;
    if (!checker) {
      throw new Error('FileTool.edit: ctx.permissionChecker not injected (Assembly should inject via createClawPermissionChecker)');
    }
    checker.resolveAndCheck(resolved, 'write');

    // File must exist
    const exists = await ctx.fs.exists(resolved);
    if (!exists) {
      return {
        success: false,
        content: `Error: File '${filePath}' does not exist (use write to create)`,
      };
    }

    const content = await ctx.fs.read(resolved);

    // Match checking
    const matches = countMatches(content, oldString);
    if (matches === 0) {
      return {
        success: false,
        content: `Error: 0 matches for old_string in '${filePath}' (G4 fail loud / check exact string including whitespace / newlines / indentation)`,
      };
    }
    if (matches > 1 && !replaceAll) {
      return {
        success: false,
        content: `Error: ${matches} matches for old_string in '${filePath}' (G4 fail loud / expand old_string with more context to make it unique / or use replace_all=true for explicit batch)`,
      };
    }

    // Backup
    const backupPath = await backupToSync(ctx, resolved, 'edit_backup');

    // Replace
    const replaced = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    await ctx.fs.writeAtomic(resolved, replaced);
    // edit operates on whole content (read full, replace, write back) → counts as full read post-edit
    const newStat = await ctx.fs.stat(resolved);
    ctx.readFileState.set(resolved, {
      hash: computeContentHash(replaced),
      timestamp: newStat.mtime.getTime(),
      isFullRead: true,
    });

    const replacedCount = replaceAll ? matches : 1;
    const backupHint = backupPath ? ` (backup: ${backupPath})` : '';
    return {
      success: true,
      content: `Edited: ${filePath} (replaced ${replacedCount}/${matches} matches)${backupHint}`,
      metadata: { replaced: replacedCount },
    };
  },
};
