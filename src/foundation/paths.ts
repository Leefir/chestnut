/**
 * Shared path constants — system-level directory structure convention (M#3 single owner)
 *
 * Previously in src/types/paths.ts (cross-module shared types anti-pattern).
 * foundation/paths.ts is the canonical location.
 */

export const LOGS_DIR = 'logs' as const;
export const DIALOG_DIR = 'dialog' as const;
export const CLAWS_DIR = 'claws' as const;
export const CLAWSPACE_DIR = 'clawspace' as const;
export const STATUS_SUBDIR = 'status' as const;

export const TASKS_QUEUES_PENDING_DIR = 'tasks/queues/pending';
export const TASKS_QUEUES_RUNNING_DIR = 'tasks/queues/running';
export const TASKS_QUEUES_DONE_DIR = 'tasks/queues/done';
export const TASKS_QUEUES_FAILED_DIR = 'tasks/queues/failed';
export const TASKS_SYNC_DIR = 'tasks/sync';

export const INBOX_PENDING_DIR = 'inbox/pending';
export const INBOX_DONE_DIR = 'inbox/done';
export const INBOX_FAILED_DIR = 'inbox/failed';
export const OUTBOX_PENDING_DIR = 'outbox/pending';
export const DIALOG_ARCHIVE_DIR = 'dialog/archive';

export const CLAW_SUBDIRS = [
  DIALOG_DIR,
  DIALOG_ARCHIVE_DIR,
  INBOX_PENDING_DIR,
  INBOX_DONE_DIR,
  INBOX_FAILED_DIR,
  OUTBOX_PENDING_DIR,
  'outbox/done',
  'outbox/failed',
  TASKS_QUEUES_PENDING_DIR,
  TASKS_QUEUES_RUNNING_DIR,
  TASKS_QUEUES_DONE_DIR,
  TASKS_QUEUES_FAILED_DIR,
  'tasks/queues/results',
  'tasks/sync/exec',
  'tasks/sync/write',
  'tasks/sync/subagent',
  'tasks/sync/spawn',
  'tasks/sync/shadow',
  'tasks/subagents',
  'memory',
  'contract',
  'skills',
  CLAWSPACE_DIR,
  LOGS_DIR,
  STATUS_SUBDIR,
] as const;
