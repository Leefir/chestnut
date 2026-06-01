/**
 * @module L6.Assembly.Guidance
 * phase 9: composer for inbox type `task_result` — NO_GUIDANCE sentinel.
 *
 * body 已是 JSON self-contained framing（含 taskId / result / is_error 等字段、LLM 自决）.
 */

import { NO_GUIDANCE } from '../types.js';

export const composer = NO_GUIDANCE;
