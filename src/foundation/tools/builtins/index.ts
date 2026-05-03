/**
 * Builtin tools - Built-in tool implementations
 */

import type { ToolRegistry } from '../executor.js';

/**
 * Register all non-FileTool builtin tools to a registry
 * (FileTool 4 tool 抽出 phase428 → src/foundation/file-tool/ / Assembly 显式 register 经 createFileTools)
 * status 注册：phase446 后 status 业务归 StatusService L5 / 不再经 registerBuiltinTools / Assembly 显式注册
 */
export function registerBuiltinTools(registry: ToolRegistry): void {
  // 0 builtin tools remain in L2 foundation / all migrated to owner modules
}
