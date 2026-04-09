/**
 * Tool profiles - define which tools are available in each profile
 */

import type { ToolProfile } from '../../types/config.js';

/**
 * Tool name lists for each profile
 */
export const TOOL_PROFILES: Record<ToolProfile, string[]> = {
  full:     ['read', 'write', 'search', 'ls', 'send', 'done', 'spawn', 'dispatch', 'skill', 'exec', 'status', 'memory_search'],
  readonly: ['read', 'search', 'ls', 'status', 'memory_search'],
  subagent: ['read', 'write', 'search', 'ls', 'exec', 'skill', 'memory_search'],
  miner:    ['read', 'write', 'search', 'ls', 'exec', 'skill', 'memory_search', 'ask_motion'],
  dream:    ['read', 'search', 'ls', 'memory_search'],
  verifier: ['read', 'ls', 'search', 'exec'],
};
