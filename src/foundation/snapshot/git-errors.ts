import { ok, err as errResult, type Result } from '../../types/result.js';

/** 预期失败：git 语义上的可识别状态，降级不抛 */
export type ExpectedGitFailure =
  | { kind: 'not_a_repo'; stderr: string }
  | { kind: 'nothing_to_commit'; stderr: string }
  | { kind: 'no_commits_yet'; stderr: string }
  | { kind: 'no_repo_handle'; stderr: string }
  | { kind: 'uncategorized'; exitCode: number; stderr: string };

const EXPECTED_PATTERNS: Array<{ kind: ExpectedGitFailure['kind']; re: RegExp }> = [
  { kind: 'not_a_repo', re: /fatal:\s+not a git repository/i },
  { kind: 'nothing_to_commit', re: /nothing to commit.*working tree clean/i },
  { kind: 'no_commits_yet', re: /does not have any commits yet/i },
  { kind: 'no_repo_handle', re: /could not get a repository handle/i },
];

const UNEXPECTED_ERRNO = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EIO']);

export interface GitExecError {
  code?: string;
  exitCode?: number;
  signal?: string;
  stderr?: string;
  message: string;
}

/**
 * 把 exec git 的原始错误分类：
 * - 返 Result.ok → 预期失败，调用方降级
 * - throw → 不可预期失败，调用方上抛
 */
export function classifyGitError(e: GitExecError): Result<ExpectedGitFailure, never> {
  // 1) 不可预期：exec 本身失败（errno 白名单）
  if (e.code && UNEXPECTED_ERRNO.has(e.code)) {
    throw e;
  }
  // 2) 不可预期：被信号终止（有 signal 字段）
  //    注意：git fatal 错误也常返回 exit 128，但不代表信号终止；
  //    因此仅当 signal 明确存在时才视为不可预期。
  if (e.signal) {
    throw e;
  }
  const stderr = e.stderr ?? e.message ?? '';
  // 3) 预期：stderr match 白名单
  for (const { kind, re } of EXPECTED_PATTERNS) {
    if (re.test(stderr)) {
      return ok({ kind, stderr } as ExpectedGitFailure);
    }
  }
  // 4) 守恒：exit 非 0 但无 match → 视为预期 uncategorized
  if (typeof e.exitCode === 'number' && e.exitCode > 0) {
    return ok({ kind: 'uncategorized', exitCode: e.exitCode, stderr } as ExpectedGitFailure);
  }
  // 5) 其他（exitCode 缺失 / stderr 空且无 code）→ 不可预期
  throw e;
}
