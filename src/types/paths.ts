// Thin wrapper — re-exports from canonical owner foundation/paths.ts
// During migration. Once all consumers import from canonical source, this file is deleted.

export {
  LOGS_DIR,
  DIALOG_DIR,
  CLAWS_DIR,
  CLAWSPACE_DIR,
  STATUS_SUBDIR,
  TASKS_QUEUES_PENDING_DIR,
  TASKS_QUEUES_RUNNING_DIR,
  TASKS_QUEUES_DONE_DIR,
  TASKS_QUEUES_FAILED_DIR,
  TASKS_SYNC_DIR,
  INBOX_PENDING_DIR,
  INBOX_DONE_DIR,
  INBOX_FAILED_DIR,
  OUTBOX_PENDING_DIR,
  DIALOG_ARCHIVE_DIR,
  CLAW_SUBDIRS,
} from '../foundation/paths.js';
