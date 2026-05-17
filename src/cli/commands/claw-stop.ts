/**
 * @module L6.CLI.Claw.Stop
 * Stop the Claw daemon process
 */

import * as path from 'path';
import {
  loadGlobalConfig, clawExists, getClawDir, getGlobalConfigPath,
} from '../../foundation/config/index.js';
import { CONFIG_DEFAULTS } from '../../assembly/config-defaults.js';
import { CliError } from '../errors.js';
import { createDirContext, createProcessManagerForCLI } from '../utils/factories.js';
import type { AuditLog } from '../../foundation/audit/index.js';
import { CLI_AUDIT_EVENTS } from '../audit-events.js';

export async function stopCommand(name: string, deps?: { audit?: AuditLog }): Promise<void> {
  const audit = deps?.audit;
  loadGlobalConfig(CONFIG_DEFAULTS);
  
  if (!clawExists(name)) {
    throw new CliError(`Claw "${name}" does not exist`);
  }

  const globalConfigPath = getGlobalConfigPath();
  const baseDir = path.dirname(globalConfigPath);
  
  const processManager = createProcessManagerForCLI();
  const { audit: systemAudit } = createDirContext(baseDir);

  // Check if running
  if (!processManager.isAlive(name)) {
    console.log(`Claw "${name}" is not running`);
    return;
  }

  console.log(`Stopping Claw "${name}"...`);

  const success = await processManager.stop(name);
  if (success) {
    audit?.write(CLI_AUDIT_EVENTS.CLAW_STOP, `name=${name}`, `status=success`);
    console.log(`✓ Stopped Claw "${name}"`);
  } else {
    audit?.write(CLI_AUDIT_EVENTS.CLAW_STOP, `name=${name}`, `status=failed`);
    throw new CliError(`Failed to stop Claw "${name}"`);
  }
}
