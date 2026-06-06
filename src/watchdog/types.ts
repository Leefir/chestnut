import type {
  isAlive as defaultIsAlive,
  kill as defaultKill,
} from '../foundation/process-exec/index.js';

export interface WatchdogProcessDeps {
  kill?: typeof defaultKill;
  isAlive?: typeof defaultIsAlive;
}
