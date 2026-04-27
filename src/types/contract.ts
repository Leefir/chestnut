/**
 * Contract types - Task management and orchestration
 * Phase 0: Interface definitions only
 */

import type { Priority } from './priority.js';

export type ContractStatus =
  | 'pending'    // Waiting to be picked up
  | 'running'    // Currently being executed
  | 'paused'     // Temporarily suspended
  | 'completed'  // Successfully finished
  | 'failed'     // Execution failed
  | 'cancelled'; // Manually cancelled

export type SubtaskStatus =
  | 'todo'         // Not yet started (within a running contract)
  | 'in_progress'  // Undergoing acceptance verification
  | 'completed'    // Successfully finished
  | 'failed';      // Execution failed

export interface SubTask {
  id: string;
  description: string;
  status: SubtaskStatus;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface Contract {
  id: string;
  title: string;
  description: string;
  status: ContractStatus;
  priority: Priority;

  // Creator
  creator: string;     // Motion ID or Claw ID that created this

  // Task structure
  goal: string;
  subtasks: SubTask[];

  // Auth level for actions
  auth_level: 'auto' | 'notify' | 'confirm';

  // Timestamps
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

