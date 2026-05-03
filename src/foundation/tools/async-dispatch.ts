import type { CallerType } from '../tool-protocol/index.js';

export interface AsyncToolTaskArgs {
  toolName: string;
  args: Record<string, unknown>;
  parentClawDir: string;
  parentClawId: string;
  isIdempotent: boolean;
  maxRetries: number;
  retryCount: number;
  callerType?: CallerType;
  toolUseId?: string;
}

export type ScheduleAsyncTool = (args: AsyncToolTaskArgs) => Promise<string>;
