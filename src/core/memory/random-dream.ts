import * as path from 'path';
import { formatErr } from "../../foundation/utils/index.js";
import { MOTION_CLAW_ID } from '../../constants.js';
import { FileNotFoundError } from '../../foundation/fs/types.js';
import type { FileSystem } from '../../foundation/fs/types.js';
import { MEMORY_AUDIT_EVENTS } from './audit-events.js';
import { MEMORY_DREAM_OUTPUTS_DIR } from './memory-paths.js';
import type { AuditLog } from '../../foundation/audit/index.js';
import type { AsyncTaskSystem } from '../async-task-system/index.js';
import type { InboxMessageOptionsBase } from '../../foundation/messaging/index.js';
import type { ProgressData } from '../contract/index.js';
import type { ContractId } from '../contract/types.js';
import { type TaskId, makeTaskId } from '../async-task-system/types.js';
import { listArchiveContracts } from '../contract/index.js';
import {
  RANDOM_DREAM_SYSTEM_PROMPT,
  buildRandomDreamPrompt,
} from './prompts/random-dream.js';

const DEFAULT_RANDOM_DREAM_TIMEOUT_MS = 3600 * 1000;  // 1h
const DEFAULT_RANDOM_DREAM_MAX_STEPS = 200;

// ─── 类型定义 ────────────────────────────────────────────────

/** phase 92: DI callback - caller (L6 装配期) bind chestnutRoot + MOTION_CLAW_ID + notifyClaw + fs + audit */
export type RandomDreamNotifyMotionFn = (message: InboxMessageOptionsBase) => void;

export interface RandomDreamOptions {
  motionDir: string;
  taskSystem: AsyncTaskSystem;
  fs: FileSystem;             // baseDir = chestnutRoot
  motionFs: FileSystem;       // baseDir = motionDir / NEW
  audit: AuditLog;
  /** Poll interval (ms) for waitForTaskResult / default 30_000 / phase 633 ⚓11 α */
  pulseIntervalMs?: number;
  /** Emit per-pulse audit RANDOM_DREAM_PULSE / default false（防 audit noise）/ phase 633 ⚓11 α */
  pulseAuditEnabled?: boolean;
  /** Subagent task timeout (ms) / default 1h / phase 651 */
  subagentTimeoutMs?: number;
  /** Subagent max steps / default 200 / phase 651 */
  subagentMaxSteps?: number;
  /** phase 92: caller-bound notify motion inbox */
  notifyMotion: RandomDreamNotifyMotionFn;
  signal?: AbortSignal;
  /** 读取指定 claw+contract 的 progress（M#3：不走直接文件访问） */
  getContractProgress?: (clawId: string, contractId: ContractId) => Promise<ProgressData | null>;
}

interface WeightedContract {
  clawId: string;
  contractId: ContractId;
  contractDir: string;
  weight: number;
  hint: string;
}

interface RandomDreamState {
  processedContractIds: string[];
}

// ─── Random Dream State I/O ──────────────────────────────────

const RANDOM_DREAM_STATE_FILE = '.random-dream-state.json';

function loadRandomDreamState(fs: FileSystem, audit: AuditLog): RandomDreamState {
  try {
    const parsed: unknown = JSON.parse(fs.readSync(RANDOM_DREAM_STATE_FILE));
    if (typeof parsed === 'object' && parsed !== null &&
        Array.isArray((parsed as { processedContractIds?: unknown }).processedContractIds) &&
        (parsed as { processedContractIds: unknown[] }).processedContractIds.every(x => typeof x === 'string')) {
      return parsed as RandomDreamState;
    }
    audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_ERROR,
      `step=load_state_shape_invalid`,
      `reason=processedContractIds_not_string_array`);
    return { processedContractIds: [] };
  } catch (err) {
    // FileNotFoundError 首启良性 / silent
    if (err instanceof FileNotFoundError) {
      return { processedContractIds: [] };
    }
    // 其他 IO 错（parse 损坏 / 权限 / 等）必 audit + 返空 resilient
    audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_ERROR,
      `step=load_state`,
      `reason=${formatErr(err)}`,
    );
    return { processedContractIds: [] };
  }
}

function saveRandomDreamState(fs: FileSystem, state: RandomDreamState, audit: AuditLog): void {
  try {
    fs.writeAtomicSync(
      RANDOM_DREAM_STATE_FILE,
      JSON.stringify(state, null, 2)
    );
  } catch (err) {
    audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_ERROR,
      `step=save_state`,
      `reason=${formatErr(err)}`,
    );
    throw err;   // re-throw 保 caller flow（cron runner phase 552 late_error 路径捕获）
  }
}

// ─── 契约发现与权重计算 ──────────────────────────────────────



/** 计算契约权重（越高越优先） */
type SubtaskInfo = ProgressData['subtasks'][string];

function calculateWeightFactors(
  subtasks: SubtaskInfo[],
): { recencyBonus: number; difficultyBonus: number; hints: string[] } {
  const hints: string[] = [];

  // 近期完成加权（7 天内权重最高）
  const completedAts = subtasks
    .map(s => s.completed_at ? new Date(s.completed_at).getTime() : 0)
    .filter(t => t > 0);
  let recencyBonus = 0;
  if (completedAts.length > 0) {
    const latestMs = Math.max(...completedAts);
    const daysAgo = (Date.now() - latestMs) / (1000 * 60 * 60 * 24);
    recencyBonus = Math.round(50 * Math.exp(-daysAgo / 7));
    if (recencyBonus > 20) hints.push('近期完成');
  }

  // 失败/困难加权（phase 1405: force_accepted = system 强接受 = 难点信号）
  let difficultyBonus = 0;
  for (const s of subtasks) {
    if (s.force_accepted === true) difficultyBonus += 20;
    else if ((s.retry_count ?? 0) >= 2) difficultyBonus += 10;
  }
  if (difficultyBonus > 0) hints.push('执行困难');

  return { recencyBonus, difficultyBonus, hints };
}

async function computeWeight(
  fs: FileSystem,
  contractId: ContractId,
  contractDir: string,
  clawId: string,
  processedIds: Set<string>,
  clawsSeen: Set<string>,     // 本次已选中的 clawId 集合
  audit: AuditLog,
  getContractProgress?: (clawId: string, contractId: ContractId) => Promise<ProgressData | null>,
): Promise<{ weight: number; hint: string }> {
  let weight = 10;
  const hints: string[] = [];

  // 已被处理过：大幅降权
  if (processedIds.has(contractId)) {
    weight -= 80;
    hints.push('已处理');
  }

  // 不同 claw 优先
  if (!clawsSeen.has(clawId)) {
    weight += 30;
    hints.push('新claw');
  }

  // 近期完成：读 progress 中各 subtask 的 completed_at
  // M#3：优先走 ContractSystem 公开 API；fallback 直接文件访问（兼容未注入场景）
  if (getContractProgress) {
    try {
      const progress = await getContractProgress(clawId, contractId);
      if (!progress) {
        throw new Error('progress unavailable (schema corruption)');
      }
      const subtasks = Object.values(progress.subtasks ?? {});
      const factors = calculateWeightFactors(subtasks);
      weight += factors.recencyBonus + factors.difficultyBonus;
      hints.push(...factors.hints);
    } catch (e) {
      audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_ERROR,
        `step=getContractProgress_api`,
        `clawId=${clawId}`,
        `contractId=${contractId}`,
        `reason=${formatErr(e)}`);
      // best-effort：API 失败、跳过 recency/difficulty 加权
    }
  } else {
    // fallback：直接读 progress.json（backward compatible / 未注入 ContractSystem 时）
    const progressPath = path.join(contractDir, 'progress.json');
    try {
      const parsed: unknown = JSON.parse(fs.readSync(progressPath));
      if (typeof parsed !== 'object' || parsed === null || typeof (parsed as Record<string, unknown>).subtasks !== 'object') {
        audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_ERROR,
          'step=load_progress', 'reason=shape_mismatch', `got=${typeof parsed}`);
        return { weight, hint: hints.join('、') || '正常' };
      }
      const progress = parsed as ProgressData;
      const subtasks = Object.values(progress.subtasks ?? {});
      const factors = calculateWeightFactors(subtasks);
      weight += factors.recencyBonus + factors.difficultyBonus;
      hints.push(...factors.hints);
    } catch (e) {
      // ENOENT 是预期（contract 无 progress.json 是正常初态）— 仅非 ENOENT 必 audit
      const isMissing =
        (e as NodeJS.ErrnoException).code === 'ENOENT' ||
        e instanceof FileNotFoundError;
      if (!isMissing) {
        audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_ERROR,
          `step=load_progress_fallback`,
          `contractDir=${contractDir}`,
          `reason=${formatErr(e)}`);
      }
    }
  }

  // 权重下限 1
  weight = Math.max(1, weight);
  return { weight, hint: hints.join('、') || '正常' };
}

async function discoverWeightedContracts(
  fs: FileSystem,
  state: RandomDreamState,
  audit: AuditLog,
  getContractProgress?: (clawId: string, contractId: ContractId) => Promise<ProgressData | null>,
): Promise<WeightedContract[]> {
  const processedIds = new Set(state.processedContractIds);
  const clawsSeen = new Set<string>();
  const contracts: WeightedContract[] = [];

  // Phase 1335 (r138 F fork): cross-module query API 替代直扫
  const archiveContracts = await listArchiveContracts({ fs });

  for (const ref of archiveContracts) {
    const { clawId, contractId, contractDir } = ref;
    const { weight, hint } = await computeWeight(fs, contractId, contractDir, clawId, processedIds, clawsSeen, audit, getContractProgress);
    contracts.push({ clawId, contractId, contractDir, weight, hint });
    clawsSeen.add(clawId);  // NEW phase 585 / 每 claw 首契约获 +30 bonus / 后续不获
  }

  // 按权重降序排序
  contracts.sort((a, b) => b.weight - a.weight);

  // 标记每个 claw 首次出现（用于 prompt 的 hint 显示）
  const firstSeenClaws = new Set<string>();
  for (const c of contracts) {
    if (!firstSeenClaws.has(c.clawId)) {
      firstSeenClaws.add(c.clawId);
      // 首次出现的 claw 保留 hint（如"新claw"）
    } else {
      // 同一 claw 的后续契约，hint 去掉"新claw"标记
      c.hint = c.hint.replace(/^新claw、?|、?新claw/, '') || '正常';
    }
  }

  return contracts;
}

// ─── 等待任务结果 ────────────────────────────────────────────

export async function waitForTaskResult(
  motionFs: FileSystem,
  taskId: TaskId,
  timeoutMs: number,
  pollIntervalMs = 30_000,
  audit?: AuditLog,
  auditEnabled = false,
  signal?: AbortSignal,
): Promise<string | null> {
  // .txt 由 AsyncTaskSystem.sendResult 在 subAgent.run() 完成后写入，是可靠的完成信号
  const donePath = path.join('tasks', 'queues', 'results', taskId, 'result.txt');
  // [DREAM_OUTPUT] 块由 appendToLog 写入 .log
  const logPath  = path.join('tasks', 'queues', 'results', taskId, 'daemon.log');
  const deadline = Date.now() + timeoutMs;
  let pulseCount = 0;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      audit?.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_WARNING, `reason=aborted`, `taskId=${taskId}`);
      return null;
    }
    if (motionFs.existsSync(donePath)) {
      // 完成信号出现，读取日志内容
      if (motionFs.existsSync(logPath)) {
        return motionFs.readSync(logPath);
      }
      // .log 不存在（极端情况），降级读 .txt
      return motionFs.readSync(donePath);
    }
    if (auditEnabled && audit) {
      audit.write(
        MEMORY_AUDIT_EVENTS.RANDOM_DREAM_PULSE,
        `taskId=${taskId}`,
        `pulse=${pulseCount}`,
        `interval_ms=${pollIntervalMs}`,
      );
    }
    pulseCount++;
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  audit?.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_WAIT_TIMEOUT, `reason=poll_timeout`, `taskId=${taskId}`);
  return null;
}

// ─── 结果解析 ────────────────────────────────────────────────

interface DreamExtractionResult {
  outputs: string[];
  contractIds: string[];
}

// phase 1467: export-for-test (F9 from audit-2026-05-30) / API surface unchanged for production
/** @internal test-only export (phase 1467) */
export function __test_extractDreamOutputs(log: string): DreamExtractionResult {
  return extractDreamOutputs(log);
}

/** 从 sub-agent log 中提取 [DREAM_OUTPUT contract_id="..."]...[/DREAM_OUTPUT] 块 */
function extractDreamOutputs(log: string): DreamExtractionResult {
  const outputs: string[] = [];
  const contractIds: string[] = [];

  // 匹配 [DREAM_OUTPUT contract_id="contractId"]...内容...[/DREAM_OUTPUT]
  const re = /\[DREAM_OUTPUT\s+contract_id="([^"]+)"\]([\s\S]*?)\[\/DREAM_OUTPUT\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(log)) !== null) {
    contractIds.push(match[1]);
    outputs.push(match[2].trim());
  }

  return { outputs, contractIds };
}

// ─── 主函数 ──────────────────────────────────────────────────

/**
 * Run one random-dream pulse (cron-driven).
 *
 * Design intent (per phase 622 ratify ⚓11 = α / l4_memory_system §B.random-dream-pulse-strategy):
 * - 4 audit per invocation (step=skip_empty / scheduled / subagent_started / finished)
 * - opts.pulseIntervalMs (default 30_000) controls inner poll interval in waitForTaskResult
 * - opts.pulseAuditEnabled (default false) opt-in per-pulse audit RANDOM_DREAM_PULSE
 * - β fs.watch + γ exponential backoff rejected per phase 622 28 原则核（D5+caller-control+YAGNI dominant）
 */
export async function runRandomDream(opts: RandomDreamOptions): Promise<void> {
  const state = loadRandomDreamState(opts.fs, opts.audit);
  const weightedContracts = await discoverWeightedContracts(opts.fs, state, opts.audit, opts.getContractProgress);

  if (weightedContracts.length === 0) {
    opts.audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_JOB, `step=skip_empty`);
    return;
  }

  opts.audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_JOB, `step=scheduled`, `count=${weightedContracts.length}`);

  // 调度 sub-agent（文件驱动，watcher 异步拾起）
  const subagentTimeoutMs = opts.subagentTimeoutMs ?? DEFAULT_RANDOM_DREAM_TIMEOUT_MS;
  const subagentMaxSteps = opts.subagentMaxSteps ?? DEFAULT_RANDOM_DREAM_MAX_STEPS;

  const taskId = makeTaskId(await opts.taskSystem.schedule('subagent', {
    kind: 'subagent',
    mode: 'standard',
    intent: buildRandomDreamPrompt(weightedContracts),
    timeoutMs: subagentTimeoutMs,
    maxSteps: subagentMaxSteps,
    parentClawId: MOTION_CLAW_ID,
    originClawId: MOTION_CLAW_ID,
    systemPrompt: RANDOM_DREAM_SYSTEM_PROMPT,    // phase 546: dead import 活化（同 deep-dream 直 LLMService.call 模板 align）
  }));

  opts.audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_JOB, `step=subagent_started`, `taskId=${taskId}`);

  // 等待完成（最长 1h，每 30s 轮询）
  const log = await waitForTaskResult(
    opts.motionFs,
    taskId,
    subagentTimeoutMs,
    opts.pulseIntervalMs ?? 30_000,
    opts.audit,
    opts.pulseAuditEnabled ?? false,
    opts.signal,
  );
  if (!log) {
    opts.audit.write(
      MEMORY_AUDIT_EVENTS.RANDOM_DREAM_SUBAGENT_TIMEOUT,
      `reason=subagent_timeout`,
      `taskId=${taskId}`,  // NEW phase 758 / 让事后 grep result.txt 关联
    );
    return;
  }

  // 解析梦境输出
  const { outputs, contractIds } = extractDreamOutputs(log);
  if (outputs.length === 0) {
    opts.audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_OUTPUT_MISSING, `reason=no_output`);
    return;
  }

  opts.audit.write(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_JOB, `step=finished`, `output_count=${outputs.length}`);

  // 更新 state
  const updatedState: RandomDreamState = {
    processedContractIds: [
      ...new Set([...state.processedContractIds, ...contractIds]),
    ],
  };
  saveRandomDreamState(opts.fs, updatedState, opts.audit);

  const dreamOutput = outputs.join('\n\n---\n\n');
  const dreamOutputPath = `${MEMORY_DREAM_OUTPUTS_DIR}/${taskId}.txt`;

  // NEW: disk snapshot（motion 域）
  await opts.motionFs.ensureDir(MEMORY_DREAM_OUTPUTS_DIR);
  await opts.motionFs.writeAtomic(dreamOutputPath, dreamOutput);
  opts.audit.write(
    MEMORY_AUDIT_EVENTS.DREAM_OUTPUT_PERSISTED,
    `dreamId=${taskId}`,
    `path=${dreamOutputPath}`,
    `bytes=${dreamOutput.length}`,
  );

  // phase 92: 通过 caller-bound notifyMotion 投递到 motion inbox
  opts.notifyMotion({
    type: 'random_dream',
    source: 'cron:dream',
    priority: 'low',
    body: dreamOutput,
    idPrefix: `${Date.now()}_random_dream`,
    extraFields: { dream_count: String(outputs.length) },
  });
}
