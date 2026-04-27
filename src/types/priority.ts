/**
 * Priority type and values - Shared between messaging and contract layers
 */

export type Priority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Priority values for sorting (higher = more important)
 */
export const PRIORITY_VALUES: Record<Priority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};
