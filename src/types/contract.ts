// Thin wrapper — re-exports from canonical owner core/contract/types.ts (L4 ContractSystem)
// During migration. Once all consumers import from canonical source, this file is deleted.

export type {
  ContractStatus,
  SubtaskStatus,
  LastFailedFeedback,
  AcceptanceFailedNotification,
  SubTask,
  Contract,
} from '../core/contract/types.js';
