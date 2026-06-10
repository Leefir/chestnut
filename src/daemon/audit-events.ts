export const DAEMON_AUDIT_EVENTS = {
  // spawn / lifecycle
  SPAWN_ATTEMPT: 'daemon_spawn_attempt',
  SPAWN_SUCCESS: 'daemon_spawn_success',
  SPAWN_FAILED: 'daemon_spawn_failed',
  FORK_ATTEMPT: 'daemon_fork_attempt',
  FORK_FAILED: 'daemon_fork_failed',
  STOP_ATTEMPT: 'daemon_stop_attempt',
  STOP_SUCCESS: 'daemon_stop_success',
  STOP_FAILED: 'daemon_stop_failed',
  // daemon-loop 路径
  LOOP_INTERRUPT_POLLER_DISABLED: 'daemon_loop_interrupt_poller_disabled',
  LOOP_INTERRUPT_POLLER_ERROR: 'daemon_loop_interrupt_poller_error',
  LOOP_INTERRUPT_POLLER_RECOVERED: 'daemon_loop_interrupt_poller_recovered',
  LOOP_INTERRUPT_POLLER_RECOVERY_ATTEMPT: 'daemon_loop_interrupt_poller_recovery_attempt',
  LOOP_ITERATION: 'daemon_loop_iteration',
  LOOP_INTERRUPT: 'daemon_loop_interrupt',
  LOOP_LLM_RETRY: 'daemon_loop_llm_retry',
  LOOP_FATAL: 'daemon_loop_fatal',
  // other
  IDLE_TIMEOUT: 'daemon_idle_timeout',
  CONTRACT_CANCELLED: 'contract_cancelled',
  CRASH_NOTIFICATION: 'crash_notification',
  DAEMON_EXIT_ZERO: 'daemon_exit_zero',
} as const;

/**
 * `spawn_failed` 等异常结束事件、用于 audit 触发通知。
 */
export type DaemonAuditEvent = typeof DAEMON_AUDIT_EVENTS[keyof typeof DAEMON_AUDIT_EVENTS];
