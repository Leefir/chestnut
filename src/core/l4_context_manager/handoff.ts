/**
 * @module L4.ContextManager
 * Sub-agent handoff marker protocol
 *
 * Marker does NOT copy dialog content — it only holds a ref.
 * Resolve reads on demand via parent round id.
 */

import { randomUUID } from 'node:crypto';

export interface HandoffMarker {
  id: string;                           // UUID
  parentRound: string;                  // parent agent round id
  createdAt: number;
  /** marker does not copy dialog content, only holds ref. resolve reads on demand. */
}

export function createHandoffMarker(parentRound: string): HandoffMarker {
  return {
    id: randomUUID(),
    parentRound,
    createdAt: Date.now(),
  };
}

export function resolveHandoffMarker(id: string): HandoffMarker | null {
  // TBD: persistency strategy (in-memory map vs disk) to be decided in Step C
  void id;
  return null;
}
