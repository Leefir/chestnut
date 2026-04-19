export { Snapshot } from './snapshot.js';
export { SNAPSHOT_IGNORE_PATTERNS } from './ignore-patterns.js';

import type { FileSystem } from '../fs/types.js';
import type { Audit } from '../audit/index.js';
import { Snapshot } from './snapshot.js';

export function createSnapshot(
  dir: string,
  fs: FileSystem,
  audit: Audit,
  ignorePatterns: readonly string[],
): Snapshot {
  return new Snapshot(dir, fs, audit, ignorePatterns);
}
