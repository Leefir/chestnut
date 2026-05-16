/**
 * @module L1.FileSystem
 * FileSystem module (L1)
 *
 * clawforum 进程内代码的所有文件 I/O 的唯一入口。
 * 原子写、路径守护（OS 级 base-dir traversal + symlink）。
 * 零业务概念 — claw-space boundary 由 L4 caller 自治。
 */

// Types and interfaces
export type {
  FileEntry,
  FileSystem,
  FileSystemOptions,
  StatInfo,
} from './types.js';

// Error class — re-exported for caller convenience (canonical owner: src/types/errors.ts)
// 应然 = FileSystem 模块 own FileNotFoundError export（interfaces/l1.md FileSystem 节）/
// 实然 class 物理位 src/types/errors.ts cross-cutting types / 此处 re-export 让 caller 可经 fs 模块统一 import
export { FileNotFoundError } from '../../types/errors.js';

// Implementation classes
export { NodeFileSystem } from './node-fs.js';

// Atomic file operations
export {
  readFile,
  writeAtomic,
  appendFile,
  ensureDir,
  deleteFile,
  removeDir,
  moveFile,
  exists,
  stat,
  isDirectory,
  IGNORE_PATTERN,
} from './atomic.js';
