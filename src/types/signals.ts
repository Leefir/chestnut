// Thin wrapper — re-exports from canonical owner core/signals.ts (L3)
// During migration. Once all consumers import from canonical source, this file is deleted.

export {
  IdleTimeoutSignal,
  PriorityInboxInterrupt,
  UserInterrupt,
} from '../core/signals.js';
