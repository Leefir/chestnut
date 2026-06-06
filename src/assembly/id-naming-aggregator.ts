/**
 * Phase 140: assembly-layer ID-naming aggregator.
 *
 * Per phase 136 §5.C ratified design, the id-naming map is owned by each
 * module (the "owner" of the corresponding ID dimension) and aggregated
 * here at the assembly layer for cross-module lookup.
 *
 * Invariants:
 * - Owners declare ID_NAMING in their own audit-events.ts (M#1 + M#5).
 * - Assembly only aggregates; it does not own any ID semantics.
 * - Audit column names (auditCol) are unique across the aggregated map.
 */

export interface IdNamingEntry {
  /** snake_case audit.tsv column name */
  readonly auditCol: string;
  /** snake_case dialog metadata field, or null if not stored in dialog */
  readonly dialogMeta: string | null;
  /** camelCase TypeScript field / brand type name */
  readonly tsField: string;
  /** kebab-case CLI flag fragment (or parenthetical note if implicit) */
  readonly cliFlag: string;
}

// Step A: framework starts empty. Step C will spread-import owner maps here.
// import { RUNTIME_ID_NAMING } from '../core/runtime/runtime-audit-events.js';
// import { CONTRACT_ID_NAMING } from '../core/contract/audit-events.js';
// import { DIALOG_ID_NAMING } from '../foundation/dialog-store/audit-events.js';
// import { LLM_PROVIDER_ID_NAMING } from '../foundation/llm-provider/audit-events.js';

export const AggregatedIdNamingMap: Readonly<Record<string, IdNamingEntry>> = {
  // Step C will populate with spread imports from owner modules.
} as const;

export type AggregatedIdName = keyof typeof AggregatedIdNamingMap;

/**
 * Reverse lookup: find the aggregated id name for a given audit column.
 * Used by future reader API (B-3) and CLI (B-4) cross-surface lookup.
 */
export function lookupByAuditCol(col: string): AggregatedIdName | undefined {
  for (const [name, entry] of Object.entries(AggregatedIdNamingMap)) {
    if (entry.auditCol === col) return name as AggregatedIdName;
  }
  return undefined;
}
