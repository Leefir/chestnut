/**
 * @module L1.FileSystem
 * Permission checker port (OS-neutral)
 *
 * Defines the PermissionChecker interface that NodeFileSystem (L1) consumes.
 * Concrete claw policy implementation lives in L4 (src/core/permissions/claw-permissions.ts / phase377).
 *
 * L1 default: createNullPermissionChecker (allows all paths / OS-only / no business policy).
 */

import * as path from 'path';

export interface PermissionChecker {
  checkRead(targetPath: string): void;
  checkWrite(targetPath: string): void;
  resolveAndCheck(relativePath: string, operation: 'read' | 'write'): string;
}

/**
 * Default null permission checker (OS-only / allows all paths within baseDir).
 * Use when no business policy is needed (e.g., system fs / test fixtures).
 *
 * NodeFileSystem ctor falls back to this when no checker is injected.
 */
export function createNullPermissionChecker(baseDir: string): PermissionChecker {
  return {
    checkRead: () => { /* no-op */ },
    checkWrite: () => { /* no-op */ },
    resolveAndCheck(relativePath: string, _operation: 'read' | 'write'): string {
      return path.resolve(baseDir, relativePath);
    },
  };
}
