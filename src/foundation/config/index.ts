/**
 * Configuration barrel re-export / phase 500 A.3 functional split
 *
 * 3 sub-file:
 * - loader.ts (generic yaml CRUD)
 * - global-config-path.ts (getGlobalConfigPath path primitive)
 * - (crud.ts removed in phase 298: business wrappers moved to assembly/config-load.ts)
 *
 * Path getters live in foundation/install-paths.ts; getGlobalConfigPath own here (phase 73).
 * Specific root-config business wrappers now live in assembly/config-load.ts (phase 298).
 */

// Path getters + shared constants (canonical owner: L6 Assembly)
export {
  getWorkspaceRoot,
  getClawDir,
  getClawConfigPath,
  getChestnutRoot,
  getNamedSubrootDir,
} from '../install-paths.js';
export { getGlobalConfigPath } from './global-config-path.js';

// Phase 10 Step B: new thin loader (generic L2a API)
export {
  loadYamlConfig,
  writeYamlConfig,
  patchYamlConfig,
  configExists,
} from './loader.js';
export type { LoaderDeps } from './loader.js';

// LLM Provider presets (re-export to avoid CLI bypassing L2 config, phase1101)
export { PRESETS } from '../llm-provider/presets.js';
