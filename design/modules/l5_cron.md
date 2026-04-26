# Cron 接口契约

**应然**（2026-04-26 修订 / 跟 modules.md §23 align）：定时调度能力。按时间表触发任务处理器，含去重键计算、并发保护、Schedule 格式解析、Handler 异常隔离。

**实然**：`src/core/cron/runner.ts` 89 行 + `src/core/cron/index.ts` 工厂。Phase 170 合入后经 phase179/phase227/phase232 迭代，runner 层 + jobs 层 audit 全覆盖。唯一 A 类遗留 A6（lastRunKey mem-only 违反 D6）。

归属：L5 外壳与能力。
- **应然依赖**：AuditLog（L2）
- **实然依赖**：AuditLog（L2）+ Node 内置（setInterval / Date / Map / Set）

## 1. 所有权

### 归属层

L5（Agent 外壳层；phase170 L5 第 3 个契约，落地于 `src/core/cron/runner.ts` 89 行 + 本 phase 新建 `src/core/cron/index.ts`）。

### 职责（独立可变的职责集合）

- **轻量定时调度**：setInterval 驱动 tick，按 `CronSchedule` 触发 `CronJob.handler`（`start` / `stop` / `tick`）
- **去重键计算**：每 job 按 schedule 类型计算 runKey（daily / hourly / interval），同 key 期内仅触发一次（`computeRunKey`）
- **并发保护**：`running: Set<string>` 防同一 job 重叠执行（handler 未完成前不再触发）
- **Schedule 格式解析**：字符串 `'hourly'` / `'daily:HH:MM'` / `'interval:Nm'` → `CronSchedule` discriminated union（`parseSchedule` 顶层函数）
- **Handler 异常隔离**：handler 抛出时仅 console.error 不上抛，保证其他 job 不受阻；**设计意图是异常不扩散 → 合规；但未走 audit 导致失败不可审计 → 违规（§7.A2）**

### 资源

- **磁盘归属**：**无**。Cron 是纯运行时模块，无任何文件/目录归属。
- **内存句柄**：
  - `timer: ReturnType<typeof setInterval> | null`（start/stop 开关）
  - `lastRunKey: Map<string, string>`（每 job 上次 runKey，tick 比对去重）
  - `running: Set<string>`（正在跑的 job 名，防重叠）
  - 重启丢失容忍：`lastRunKey` 是派生态，重启后首次 tick 会触发当前时窗一次，与 tick 粒度（默认 1000ms）相比可容忍
- **无独占常量**：`tickIntervalMs` 默认 `1000`（`start` 默认参数）；Schedule 格式字符串（`'hourly'` / `'daily:HH:MM'` / `'interval:Nm'`）由 `parseSchedule` 定义，调用方配置传入

### 业务语义（由本模块主动发起）

- "调度器启动"：`start(tickMs?)`（装配期 Assembly 调）
- "调度器停止"：`stop()`（disassemble 路径调）
- "单次 tick"：`tick()`（setInterval 内部 + 测试手动触发）
- "Schedule 解析"：`parseSchedule(s)`（顶层 fn，装配方调用）

业务语义清单外即不做。边界参照：job handler 内容归 jobs/ 各文件各自归属（disk-monitor / llm-stats / dream-trigger / contract-observer）；jobs 构造时机 + handler 注入归 Assembly；config 读取 + 默认值归 Assembly / Config。

## 2. 接口

### 2.1 类型签名

#### Schedule 类型

```ts
export type CronSchedule =
  | { type: 'daily'; time: string }       // "HH:MM"
  | { type: 'hourly' }
  | { type: 'interval'; minutes: number };
```

- Discriminated union，`type` 字段作 tag
- `daily.time` 是 "HH:MM" 字符串约定（不校验格式，`parseSchedule` 仅切片；§5.2 约定硬化）

#### Job 接口

```ts
export interface CronJob {
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  handler: () => Promise<void>;
}
```

- `name`：job 标识，作 `lastRunKey` / `running` 键
- `enabled`：false 时 tick 跳过
- `handler`：异步业务动作，由装配方注入；异常由 Cron 内部 catch 走 console.error（§7.A2）

#### Schedule 解析

```ts
export function parseSchedule(s: string): CronSchedule;
```

**行为承诺**：
- `'hourly'` → `{ type: 'hourly' }`
- `'daily:HH:MM'` → `{ type: 'daily', time: 'HH:MM' }`（`slice(6)` 截取 "HH:MM"）
- `'interval:Nm'` → `{ type: 'interval', minutes: N }`（`parseInt(slice(9))`，`'m'` 后缀被 parseInt 忽略）
- unknown → fallback `{ type: 'hourly' }` + `console.warn`（违 Design #2，§7.A1 登记）

#### 工厂（phase170 B 动作新增）

```ts
export function createCronRunner(jobs: CronJob[]): CronRunner;
```

**使用约束**：工厂仅构造，**不调 `start()`**。调用方必须在装配完成后显式 `runner.start(tickMs)` 启动 setInterval，否则 `tick` 不会自动驱动（仅 test 可手动调 `tick()`）。与 phase166 `createRuntime` 不调 `initialize()` / phase169 `createSkillRegistry` 不调 `loadAll()` 同型。

#### CronRunner 公共方法（4 / 3 组）

**constructor**：

```ts
constructor(jobs: CronJob[]);
// 仅保存 jobs 引用（private readonly）；无副作用
```

**lifecycle**：

```ts
start(tickIntervalMs?: number): void;
// 默认 tickIntervalMs=1000；若 timer 已存在则幂等 return
// 副作用：setInterval 注册 → 每 tickIntervalMs 触发 this.tick()

stop(): void;
// clearInterval 并清 timer；运行中的 handler 不会被中断（.finally 清 running）
```

**tick**：

```ts
tick(): void;
// 遍历 jobs：
//   - !job.enabled 跳过
//   - running.has(job.name) 跳过（并发保护）
//   - computeRunKey(now, job.schedule) === lastRunKey 跳过（去重）
//   - 否则 lastRunKey.set + running.add + job.handler().catch(console.error).finally(running.delete)
// 供测试用的手动触发口（生产由 start 的 setInterval 驱动）
```

### 2.2 使用模式

#### 主装配路径（Assembly，phase170 Step 6 改造后）

```ts
import { createCronRunner, parseSchedule, CronRunner } from '../core/cron/index.js';

let cronRunner: CronRunner | undefined;
if (isMotion && (globalConfig.cron?.enabled ?? true)) {
  // 预制 clawforumFs（闭包给 jobs 共用）
  let clawforumFs: NodeFileSystem;
  try {
    clawforumFs = new NodeFileSystem({ baseDir: clawforumDir, enforcePermissions: false });
  } catch (e) {
    auditWriter.write('assemble_failed', `module=cron_runner`, `phase=fs_construct`, `reason=${errMsg(e)}`);
    throw new Error(...);
  }

  // 构造 runner + 4 jobs
  try {
    cronRunner = createCronRunner([
      { name: 'disk-monitor', enabled: ..., schedule: parseSchedule(diskScheduleStr), handler: () => runDiskMonitor({...}) },
      { name: 'llm-stats', ..., handler: () => runLlmStats({...}) },
      { name: 'dream-trigger', ..., handler: async () => { await runDeepDream({...}); await runRandomDream({...}); } },
      { name: 'contract-observer', ..., handler: () => runContractObserver({...}) },
    ]);
  } catch (e) {
    auditWriter.write('assemble_failed', `module=cron_runner`, `phase=construct`, `reason=${errMsg(e)}`);
    throw new Error(...);
  }

  // 启动（业务动作归装配方）
  try { cronRunner.start(tickMs); }
  catch (e) {
    auditWriter.write('assemble_failed', `module=cron_runner`, `phase=start`, `reason=${errMsg(e)}`);
    throw new Error(...);
  }
}
```

Handler 内容 + 参数闭包归 Assembly / jobs 各自负责；Cron 模块只负责"按时触发 + 并发保护 + 去重"。

#### 测试路径

生产代码无其他消费方；测试通过 mock `'../../src/core/cron/runner.js'` 拦截 `CronRunner` + `parseSchedule`（hoisted URL 拦截；phase169 B3 验证）。

## 3. 审计事件清单

### 3.1 CronRunner 自产事件（phase179 落地 2 类）

phase179 集成 2 类 audit 事件（2 触发点）。`cron_*` 前缀专属，与其他模块零重复。

#### 3.1.1 `cron_parse_fallback`

- **触发时机**：`parseSchedule` unknown 格式 fallback 分支（runner.ts L21 区间）
- **前置条件**：`s !== 'hourly'` && 非 `'daily:'` 前缀 && 非 `'interval:'` 前缀
- **后置状态**：return `{ type: 'hourly' }` fallback；console.warn 双写保留
- **载荷**：`input=<raw>` / `fallback=hourly`
- **audit 传递**：parseSchedule 可选参 `audit?: Audit`；Assembly 4 处调用传 auditWriter；其他调用方未传 audit 则仅 console.warn（向后兼容）

#### 3.1.2 `cron_job_error`

- **触发时机**：tick 内 `job.handler().catch` 分支（runner.ts L63 区间）
- **前置条件**：handler Promise reject
- **后置状态**：console.error 双写保留；finally 清 `running.delete`；`lastRunKey` 不 rollback（同 phase170 行为）
- **载荷**：`job=<name>` / `run_key=<key>` / `err=<message>`

#### 3.1.3 保留 console 清单（phase179 决策）

双写决策下保留作运维可见性（参 phase173 §3.3.6 模板）：

| 位置 | 级别 | 决策 | 理由 |
|---|---|---|---|
| `runner.ts:L21` | warn | 保留（双写 + §3.1.1 audit） | parseSchedule fallback 运维即时见 |
| `runner.ts:L63` | error | 保留（双写 + §3.1.2 audit） | job 异常运维即时见 |

### 3.1.x 细化期剩余事件（phase179 未实装）

phase179 D1/D2 决策省略：
- `cron_job_started` / `cron_job_finished` — 未来 A 类清零 phase 若需细粒度再加
- ~~`cron_runner_started` / `cron_runner_stopped`~~ — **phase232 已实装**（`start()` 实际触发时写 `cron_runner_started`，`stop()` 实际触发时写 `cron_runner_stopped`）

### 3.2 装配期关联事件（Assembly 产生，引用）

Cron 构造 / 启动失败由 Assembly 发 `assemble_failed`（3 条）：

- `module=cron_runner` / `phase=fs_construct` — clawforumFs 构造失败
- `module=cron_runner` / `phase=construct` — CronRunner 构造失败
- `module=cron_runner` / `phase=start` — cronRunner.start() 抛出

归 Assembly 契约 §3，本契约仅列表引用。

### 3.3 Job handler 归属事件（phase227 落地 7 类 cron_* 事件）

phase227 前本节占位"不登记"。phase227 落地后，4 个 job handler 在 `cron_*` 命名空间产生 7 类 audit 事件，注册于 `src/foundation/audit/events.ts` AUDIT_EVENTS 中。物理位置在 Cron 模块（`jobs/`），命名空间归属 Cron 契约（§7.B B.p173-1：业务语义归属其他模块，但 audit 命名空间归 Cron）。

**phase227 背景**：原 phase194 "info log 运维可见保留"判据与 Design #1/#3/#5 + Module #4 冲突（所有业务状态迁移 / 失败事件必须持久化）→ Step 1 原则对照触发 Path #6 停下 → 用户拍板 α 方向（全 18 console → audit + 双写 console 保留）。

**双写策略**：所有 18 处均先 `audit.write(...)` 后 `console.*(...)` —— audit.tsv 是权威持久化源，console 作运维可见镜像（process 重启可丢）。

#### 3.3.1 `cron_deep_dream_job`（3 处 / deep-dream lifecycle）

- **step=skip_empty**：当前 claw 无待处理 session，跳过。载荷：`clawId=...`
- **step=started**：开始处理 N 个 session。载荷：`clawId=...` `session_count=N`
- **step=finished**：处理完成，写入 N 个梦境。载荷：`clawId=...` `dream_count=N`

#### 3.3.2 `cron_deep_dream_error`（4 处 / deep-dream failures）

- **step=read_session**：读取 session 文件失败，跳过。载荷：`clawId=...` `file=...` `reason=...`
- **step=call_1**：LLM Call 1（梦境提取）失败。载荷：`clawId=...` `file=...` `reason=...`
- **step=call_2**：LLM Call 2（压缩）失败。载荷：`clawId=...` `file=...` `reason=...`
- **step=unexpected**：runDeepDream 循环外层兜底 catch。载荷：`clawId=...` `reason=...`

#### 3.3.3 `cron_disk_monitor_check`（1 处 / 周期数据）

- **触发时机**：每次磁盘扫描完成后（无论是否超阈值）。
- **载荷**：`totalMB=N` `limitMB=M`

#### 3.3.4 `cron_disk_monitor_threshold_exceeded`（1 处 / 阈值告警）

- **触发时机**：`totalMB > opts.limitMB`（超阈值），紧接 3.3.3 之后。
- **载荷**：`totalMB=N` `limitMB=M`
- **后置状态**：同时向 motion inbox 写告警消息（InboxWriter）。

#### 3.3.5 `cron_llm_stats`（2 处 / 周期数据）

- **step=empty_result**：目标日期无 LLM 调用记录。载荷：`date=YYYY-MM-DD`
- **step=report**：周期统计写入 llm-stats.jsonl。载荷：`date=...` `totalCalls=N` `successCalls=N` `failedCalls=N` `totalInputTokens=N` `totalOutputTokens=N` `avgLatencyMs=N`

#### 3.3.6 `cron_random_dream_job`（4 处 / random-dream lifecycle）

- **step=skip_empty**：无 archived contracts，跳过。载荷：（无 extra）
- **step=scheduled**：抽样 N 个契约准备调度子代理。载荷：`count=N`
- **step=subagent_started**：子代理任务已发起。载荷：`taskId=...`
- **step=finished**：子代理完成，提取 N 个梦境输出。载荷：`output_count=N`

#### 3.3.7 `cron_random_dream_warning`（3 处 / business warnings）

- **reason=task_timeout**：等待任务超时（waitForTaskResult 轮询）。载荷：`taskId=...`
- **reason=subagent_timeout**：子代理 1h 内未完成。载荷：（无 extra）
- **reason=no_output**：子代理完成但无 [DREAM_OUTPUT] 块。载荷：（无 extra）

---

## 4. 上游依赖

### 4.1 L2 AuditLog（phase179 新增）

- `import type { Audit } from '../../foundation/audit/index.js'`（runner.ts / index.ts 各 1 条）
- 调用面：CronRunner 构造期必填字段（`constructor(jobs, audit: Audit)`）；parseSchedule 可选参（`parseSchedule(s, audit?: Audit)`）
- 耦合界面：`Audit.write(type, ...fields): void`（1 方法）
- 不可消除理由：Design #1d 事后可审计承诺；phase179 §7.A A1/A2 清零驱动（§7.A3 部分清零）
- 注入形态：constructor 参数（运行期不可变 M#6）+ parseSchedule 函数参数（可选 M#8）

phase170 前 Cron 无任何产品模块依赖（"最干净 L5"），phase179 后新增 1 条 L2 依赖（runner.ts）；phase227 后 jobs/ 4 文件同样注入 `audit: Audit`（通过 Assembly opts.audit 传参）。仍是依赖最少的 L5 模块之一（对比：Runtime 依赖 16 字段 / SkillSystem 依赖 FileSystem + MessageCodec / ContractSystem 依赖多层）。

### 4.2 Node 内置依赖

仅依赖 Node.js 内置：

| 内置 | 用途 | 使用位置 |
|---|---|---|
| `setInterval` / `clearInterval` | 定时驱动 tick | `start` / `stop` |
| `Date` | 获取当前时刻 | `tick` / `computeRunKey` |
| `Map<K,V>` / `Set<T>` | 去重键 / 防重叠 | `lastRunKey` / `running` |

### 4.3 依赖层级合规

| 本模块层 | 依赖 | 被依赖层 | 合规 |
|---|---|---|---|
| L5 Cron | Audit.write | L2 AuditLog | ✓（下行依赖）|
| L5 Cron | setInterval / Date / Map / Set | Node runtime | ✓（平台基础）|

无上行依赖，无循环，符合 M#5 依赖单向。

### 4.4 为什么无 fs 依赖合规

- **无 fs 依赖合规**：Cron 仅调度，不持久化 `lastRunKey`（§1 资源节"重启丢失容忍"）；与 Runtime（纯运行时无磁盘）同型
- **audit 依赖 phase179 落地**：phase170 前为"零产品依赖"，phase179 §7.A3 清零后新增 L2 AuditLog（§4.1）；契约 §4 已同步修订

## 5. 不可消除耦合

### 5.1 CronJob 接口作为 handler 注入协议

```ts
export interface CronJob {
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  handler: () => Promise<void>;
}
```

**Cron 定义协议，Assembly 提供实现**（publisher-subscriber 形态 B，`feedback_cycle_vs_reverse_dependency`）：

- Cron 知道"何时触发 handler" / 不知道"handler 做什么"
- Assembly 知道"handler 做什么"（注入 `runDiskMonitor` / `runLlmStats` / `runDeepDream + runRandomDream` / `runContractObserver` 闭包）/ 不知道"何时触发"

**耦合方向**：Assembly → Cron（值 import + type import），Cron 不反向引用 Assembly；无代码依赖图循环。

**最小化**：接口仅 4 字段（name / enabled / schedule / handler），handler 签名仅 `() => Promise<void>` 无返回值约束；参数透过闭包注入归属装配方。

### 5.2 Schedule 字符串格式约定

`parseSchedule` 输入格式是**字符串协议**，与 Config 文件共享约定：

| 格式 | 产出 | 约定源 |
|---|---|---|
| `'hourly'` | `{ type: 'hourly' }` | 本模块定义 |
| `'daily:HH:MM'` | `{ type: 'daily', time: 'HH:MM' }` | 本模块定义（HH:MM 软约束） |
| `'interval:Nm'` | `{ type: 'interval', minutes: N }` | 本模块定义（`'m'` 后缀由 `parseInt` 自然忽略） |

**显式表达编译期的缺口**：字符串格式是运行时约束，`parseSchedule` 仅切片不校验：
- `'daily:25:99'` 会产 `{ type: 'daily', time: '25:99' }`，`computeRunKey` 运行期拆出 `h=25 m=99` 导致比较异常
- `'interval:0m'` 会产 `{ type: 'interval', minutes: 0 }`，`computeRunKey` 内 `Math.floor(... / 0) = Infinity` 导致 key 不稳定
- unknown 格式走 fallback `hourly` + console.warn（§7.A1）

细化期应补校验（独立 phase 或 §7.A1 修复时），当前契约明示"调用方保证格式合法"。

### 5.3 Handler 异常隔离协议

**契约承诺**：任一 job 的 handler 抛出异常 → 不影响 Cron 本身继续调度 + 不影响其他 job 触发。

实现：`job.handler().catch(err => console.error(...)).finally(() => running.delete(...))`（runner.ts L62-64）。

**当前偏差**：异常仅 console.error，不进 audit；对装配方不可见（§7.A2 登记）。

**语义边界**：
- Cron 只负责"异常不扩散"
- handler 内部重试 / 降级 / alert 等策略归各自业务模块（例如 `runContractObserver` 若需 retry 则在 handler 内部实现）

### 5.4 Tick 双重入口

`tick()` 是 public 方法，有两个调用方：
- **生产**：`start()` 内部的 `setInterval(() => this.tick(), tickIntervalMs)`
- **测试**：手动调 `runner.tick()` 验证某时刻的触发行为（tests/core/cron/ 间接用过）

**隐式耦合**：测试暴露 `tick()` 的时机语义（必须在 mock `Date` / fake timers 下调），属于"测试友好 public 方法"——非典型耦合，契约承诺此方法**长期保留** public（细化期若改 private 会破测试）。

## 6. 配置常量归属

### 6.1 当前字面量（Step 1 F3 / F5 实测）

| 字面量 | 出现位置 | 用途 |
|---|---|---|
| `1000` | `runner.ts:40` `start(tickIntervalMs = 1000)` | 默认 tick 粒度（ms） |
| `'hourly'` | `runner.ts:15/22` | parseSchedule hourly tag + unknown fallback |
| `'daily:'` | `runner.ts:16` | parseSchedule 前缀 |
| `'interval:'` | `runner.ts:17` | parseSchedule 前缀 |

### 6.2 归属登记

- `DEFAULT_TICK_INTERVAL_MS = 1000`（应然）：可归 Cron 模块（`src/core/cron/index.ts` 导出），但**当前不抽取**（见 6.3）
- Schedule 字符串前缀 `'daily:'` / `'interval:'` / tag `'hourly'`：`parseSchedule` 内部约定，**不抽常量**（抽出后 switch 可读性反而下降）

### 6.3 为什么不抽 `DEFAULT_TICK_INTERVAL_MS`

对比 phase169 B.p169-2/3 抽 `SKILLS_DIR_DEFAULT`：
- SkillSystem `'skills'` 字面量**散在 4 处**（registry / assemble / dispatch / daemon / tests-helper），修改需同步多点 → 抽常量有价值
- Cron `1000` **仅 1 处**（`start` 默认参数），Assembly 装配时显式传 `tickMs`（`cronRunner.start(tickMs)`；tickMs 来自 `globalConfig.cron?.tick_interval_ms ?? 1000`）→ `start` 默认值永不被用到（Assembly 总是显式传），抽常量收益零

### 6.4 Config 路径归属

tickMs 的真实来源：
- `globalConfig.cron.tick_interval_ms`（配置文件归 Config 模块）
- 默认值 `1000` 在 Assembly L409 `globalConfig.cron?.tick_interval_ms ?? 1000` 读取（**Assembly 归属默认值**，非 Cron）
- `CronRunner.start(tickIntervalMs = 1000)` 的默认参数是双保险（冗余但不冲突）

**归属判定**：默认值归 Config / Assembly 层；Cron 模块的 `= 1000` 默认参数是语义"若调用方未传则用 1000"的实现细节，不是独立常量。

### 6.5 实然偏差

**无 B 类偏差**（7.B 零条；Cron 是最干净模块，无字面量散落 / 无临时实例化 / 无 setter 注入）。

与 phase169 对比：SkillSystem 3 条 B.p169-*；Cron 零条。

## 7. 实然差距

### 7.A 必修违规（待后续 phase 消除）

所有 7.A 条目违反 Design #1d（事后可审计）/ Design #2（信息不得丢弃/静默）。粗糙期登记，细化期消除。

#### ~~A1~~ — parseSchedule unknown 格式 fallback 软吞（**phase179 已清零**）

phase179 Step 3 实装 `cron_parse_fallback` audit（双写 audit + console），§3.1.1 事件清单登记。parseSchedule 新增可选参 `audit?: Audit`，Assembly 4 处调用传 auditWriter；其他调用方未传则仅 console.warn（向后兼容）。Console 保留作运维可见性（参 phase173 §3.3.6 模板）。

#### ~~A2~~ — job handler 异常 console.error 不进 audit（**phase179 已清零**）

phase179 Step 3 实装 `cron_job_error` audit（双写 audit + console），§3.1.2 事件清单登记。载荷 `job=<name>` / `run_key=<key>` / `err=<message>`。Console 保留作运维即时可见性。handler 内部 audit 仍归各业务模块各自负责。

#### ~~A3~~ — CronRunner 无 audit 集成（**phase179/phase232 已清零**）

phase179 Step 2 升 signature（`createCronRunner(jobs, audit)` 双参必填 + CronRunner constructor `audit: Audit` 私有字段）+ Step 3 实装 2 audit type（`cron_parse_fallback` / `cron_job_error`）。

**phase227 部分消化**：原缺失的 "cron_job_started/finished" 已由 per-job lifecycle 覆盖（`cron_deep_dream_job step=started/finished` + `cron_random_dream_job step=scheduled/subagent_started/finished`）。§3.3.1 / §3.3.6 已登记。

**phase232 清零**：`cron_runner_started` / `cron_runner_stopped` 生命周期事件已实装（runner.ts `start()` / `stop()` 实际触发时写 audit，幂等 no-op 路径不写）。

#### ~~A4~~ — CronRunner class 无直接单测（**phase179 已清零**）

phase179 Step 4 新建 `tests/core/cron/runner.test.ts` 覆盖 CronRunner 核心行为（10 it）：
- `start` 幂等 / `stop` 清理
- `tick` 3 guard（enabled / running / lastRunKey）
- `computeRunKey` 3 schedule 类型 key 算法
- running 并发保护
- `cron_job_error` audit 双粒度断言（type + payload）

#### ~~A5~~ — parseSchedule fn 无直接单测（**phase179 已清零**）

phase179 Step 4 `runner.test.ts` parseSchedule describe 覆盖 7 it：
- 正常 3 分支（hourly / daily:HH:MM / interval:Nm）
- fallback + console.warn 断言
- fallback + audit 双粒度断言（`cron_parse_fallback`）
- 边界（empty / interval:0m / daily:25:99）

#### A6 — `lastRunKey` mem-only 违反 Design「磁盘即权威」（2026-04-26 新增 / 待治理）

**触发**：`design/principles.md` Design Principles 新增「磁盘即权威，内存可派生但不能为权威（运行时句柄从磁盘信息重建）」/ 同时 Module Logic Principles 修订 M4「模块的权威状态持久化到磁盘；派生态可 mem-only 但必须能从磁盘 + 外部状态重建」。

**违反**：`lastRunKey: Map<string, string>`（§1 资源 / 内存句柄）是去重时窗状态 / 决定 tick 是否触发 handler / **不可从磁盘重建**——重启后首次 tick 必触发当前时窗一次（即使该时窗已触发过）。这是真权威态丢失，不是派生态。

**判据**：
- `timer` / `running` 是真派生态（重启重建无业务影响 / 不违反）
- `lastRunKey` 是权威态（影响业务行为 / 违反）

**修订方向**（待 scope phase）：
- `lastRunKey` 落盘到 `.cron-state.json`（per Cron 实例）/ start 期间读取重建 / 每次 tick 触发后原子写

**关联**：modules.md ~~§22~~ §23 Cron 资源字段引用此条。

### 7.B 偏差登记（当前合理）

#### B.p173-1 — jobs 物理位置 α.1 → α.2 升档进行中（phase329/330/331 接力）

- **现状**：`src/core/cron/jobs/*.ts`（disk-monitor / llm-stats / deep-dream / random-dream）物理位置在 Cron 模块子目录；contract-observer 已迁出（phase329）
- **业务语义归属**：
  - `deep-dream.ts` / `random-dream.ts` → MemorySystem（L5，Philosophy "motion 主动整合持久化记忆"）
  - `llm-stats.ts` → LLMService（L1，provider 使用统计）
  - ~~`contract-observer.ts` → ContractSystem（L4，契约活跃度监测）~~ **phase329 已物理搬迁至 `src/core/contract/jobs/contract-observer.ts`**
  - `disk-monitor.ts` → 系统监控（未归属到明确模块；暂可归 Cron 自身业务 or 未来 L2 新增"资源监控"模块）
- **为何升档**：phase326 critical C3 审计确认 jobs/ 总行数 297 > 框架自身 124 行，B.p173-1 升档条件满足；应然层级合规要求强制
- **进展**：phase329 ✓ contract-observer 已搬迁 ContractSystem；phase330/331 待 disk-monitor + llm-stats

**本 phase 无其他 `B.p170-*` 登记**。

Cron 是 clawforum 迄今最干净模块：
- 无临时实例化（`new CronRunner` 仅 1 处在 Assembly 主路径）
- 无字面量散落需抽常量（`1000` 仅 1 处且 Assembly 总显式传值，§6.3）
- 无 setter 双阶段注入（构造一次性完成）
- 无 continuation helper 闭包依赖（DispatchTool 这种 B.p166-1 形态不存在）
- 无 identity 分支（Cron 是 motion-only，但分支在 Assembly gate `isMotion`，Cron 内部无 identity 感知）

与 phase169 SkillSystem（3 条 B.p169-*）+ phase166 Runtime（6 条 B.p166-*）对比，Cron 零偏差登记符合模块简洁性直觉。

**若未来新增偏差**（如细化期补 audit 后注入模式引入 setter 之类）：按 `B.p170-*` 编号扩充。

### 7.C 原则对照

全 29 条覆盖（Module Logic 11 + Design 11 其中 #1 展 4 面 + Philosophy 4 = 29）。

#### Module Logic Principles（11 条）

- **M1 独立可变职责**：合规。Cron 职责 = 定时调度 + 去重 + 并发保护 + 格式解析 + 异常隔离；变更源（schedule 类型 / tick 粒度 / 去重键策略 / 异常策略）与 L4/L5 其他模块独立
- **M2 业务语义归属**：合规。`start` / `stop` / `tick` / `parseSchedule` 全由 Cron 发起；handler 执行归各业务模块
- **M3 资源归属**：合规。**无磁盘资源**（§1 资源节）；内存句柄 `timer` / `lastRunKey` / `running` 全归 CronRunner
- **M4 持久化**：合规。Cron 纯运行时（§1 "重启丢失容忍"明示）
- **M5 依赖单向 / 禁循环**：合规。**零产品依赖**（§4.1），仅 Node 内置；publisher-subscriber 形态 B（§5.1）无循环
- **M6 依赖结构稳定**：合规。构造期 `jobs: CronJob[]` 一次性注入，运行期不变
- **M7 耦合界面稳定**：合规。本 phase 仅加 `createCronRunner` 工厂 + `src/core/cron/index.ts` 聚合；不改 4 公共方法签名
- **M8 耦合界面最小**：合规。4 class 方法 + 1 fn + 2 type + 1 interface，暴露面最小（L5 最简）
- **M9 显式表达编译器可检**：合规。`CronSchedule` discriminated union + `CronJob` interface + handler 返回 `Promise<void>` 全 tsc 强类型
- **M10 不合理停下**：触发 1 次，详见 §7.Phase 纪律.1（Step 1 扫描发现总览 1 处消费点数字偏差 → 停下回改总览）
- **M11 边界不对停下**：未触发

#### Design Principles（11 条；#1 展 4 面）

- **D1a 信息不丢失**：**合规**（phase179 runner 2 audit 清零；**phase227 jobs 18 全 audit**；双写 console 保留镜像；全 18 事件点审计）
- **D1b 状态可观察**：**合规**（phase227 前：运行期 tick 状态仅 console 可见；**phase227 后：jobs lifecycle + 失败事件全入 audit.tsv**；`lastRunKey` / `running` 内存可查；Assembly audit 构造/启动失败）
- **D1c 中断可恢复**：合规。`stop()` + `start()` 可重启；`lastRunKey` 丢失容忍（§1 资源节）
- **D1d 事后可审计**：**合规**（phase227 per-job lifecycle 已覆盖 `cron_job_started/finished` 类需求（§3.3.1/§3.3.6）；**phase232 已实装 `cron_runner_started/stopped`**，runner lifecycle 可从 audit.tsv 重建）
- **D2 不得丢弃/静默**：**合规**（phase179 runner 2 audit + **phase227 jobs 18 全 audit**；全业务状态事件持久化；无静默丢弃）
- **D3 用户可观察**：**合规**（phase179 runner audit + **phase227 jobs 7 type 18 事件全入 audit.tsv**；用户可从 audit.tsv 重建 jobs 完整执行链路；phase224 M#1 Path #1 复核前进）
- **D4 LLM 调用恢复**：无关（Cron 不涉 LLM；deep-dream job handler 内部的 LLM 归 MemorySystem）
- **D5 日志重建**：**合规**（phase227 per-job lifecycle 全入 audit → jobs 执行链路可完整重建；**phase232 已实装 `cron_runner_started/stopped`** → runner lifecycle 可从 audit.tsv 完整重建）
- **D6 智能体决策主体**：无关（Cron 是基础设施）
- **D7 系统可信路径**：合规。Cron 作为受信系统组件
- **D8 事件驱动**：合规。setInterval 驱动 tick 是事件驱动的简单形态
- **D9 多 claw 不隔绝**：无关
- **D10 motion 特殊**：合规。Assembly gate `isMotion` 决定是否装 Cron（motion-only）；Cron 模块本身无 identity 感知
- **D11 CLI 唯一对外**：无关

#### Philosophy（4 条）

- **P1 Agent 即目录**：灰度。Cron 本身不涉目录；jobs/ 各 handler 消费 `clawforumDir` / `motionDir`（归 Assembly 装配）
- **P2 上下文工程**：无关（Cron 是基础设施）
- **P3 多 agent 利用**：合规。Cron 给 motion 提供定时整合能力（dream-trigger / contract-observer）
- **P4 系统为智能体服务**：合规。Cron 是 "系统为智能体服务" 的典型：给 motion 提供决策所需的周期性信息（disk / llm-stats / dream / contract-observer）

### 7.Phase 执行纪律

本 phase 实施过程中的非架构偏差登记（按 `feedback_module_contract_structure` §7.Phase 硬化规则）。

#### 纪律.1 — 总览 1 处消费点数字偏差（Step 1 F14 捕获）

- **触发**：Step 1 F14 复核发现总览 §背景"消费点 4 处 / tests mock 2 处"与实测"6 处 / 3 处"不符
- **违反条款**：`feedback_verify_facts_before_plan`（清单性断言一律佐证）
- **纠错链路**：Step 1 F14 偏差清单 → Step 2 落笔前回改总览 §背景 消费点节（1 处 Edit）
- **根因**：总览起稿虽已 grep 佐证大部分数字，但 tests mock 按"行数 2"凭直觉而非数 `grep -n` 真实行数
- **治理路径**：本 phase 已治理；元规则层面 `feedback_verify_facts_before_plan` 已覆盖，无升格

#### 纪律.2 — phase169 C4 硬化首次应用（总览事实核查节带行号）

- **触发**：phase169 复盘 C4 提出"总览 §事实核查节必须附每条 grep 的命中行号摘录"作为结构硬化候选；本 phase 首次在总览 §事实核查节贴了实测 grep 命中行号（不仅列命令）
- **违反条款**：无（正向应用）
- **效果**：总览数字断言准确率提升（phase169 总览 3 处事实错 → phase170 总览 1 处小偏差；错误数量下降）
- **治理路径**：已按 `feedback_verify_facts_before_plan` + phase169 C4 提议应用；可作为下一 phase 模板继续沿用

#### 纪律.3 — D4 临时实例化决策 "零条"

- **触发**：Step 1 F9 实测 `new CronRunner` 仅 1 处（Assembly 主路径），无同 phase169 SkillSystem 的 4 处临时实例化
- **违反条款**：无
- **根因**：Cron 模块设计简洁（motion-only + 单一调度点），与 SkillSystem（多 agent 语境 + 工具临时实例化）本质不同
- **治理路径**：粗糙期 β 决策退化为"归位唯一主路径"；§7.B 零条显式登记

#### 纪律.4 — 无 agent 越界 / 无纠错链路追加修

本 phase 无 agent 在产品代码加 test-aware fallback / 自主扩字段等越界；无 Step N → Step N-1 反向修补。

#### 纪律.6 — phase179 Cron §7.A 5 条清零（**2026-04-21 新增**）

- **触发**：phase179 Step 1 扫描 F15 核查 runner.ts 实测 89 行 vs phase170 总览登记 90 行（差 1 行非实质偏差 N1）
- **违反条款**：无（差 1 行属非实质登记精度问题）
- **纠错链路**：F15 登记偏差 N1；契约不修（非关键）
- **根因**：phase170 总览 "90 行" 可能含注释/空行计数差异
- **治理路径**：本纪律登记即止；signature 升级（`createCronRunner(jobs, audit)` 双参必填）属破坏性改动，按 Path #4 commit msg 显式论证

#### 纪律.5 — phase169 C2 教训应用

- **触发**：Step 8 合入计划落笔前，按 phase169 C2 教训（`feedback_merge_base_verification`）先核 `local main` vs `origin/main` 权威性，**不再凭记忆套"rebase origin/main"模板**
- **违反条款**：无（正向应用）
- **效果**：Step 8 计划直接基于 local main 权威写 rebase/merge 目标；避免 phase169 Step 8 遭遇的 279-commit 跨度 rebase 冲突
- **治理路径**：已按 `feedback_merge_base_verification` 应用

#### 纪律.7 — D.1 Assembly CronRunner 工厂切换登记补齐（**2026-04-22 phase208 新增**）

- **触发**：整理债.md §D.1 表 "new CronRunner" 行原记"真 drift：工厂存在但未用"至 phase208 复盘发现实然已走工厂
- **实然核**（phase208 Step 1 grep）：
  - `src/assembly/assemble.ts:33` import `createCronRunner` ✓
  - `src/assembly/assemble.ts:430` 调用 `createCronRunner([...])` ✓
  - `grep -n "new CronRunner" src/` → 0 命中
- **消化 phase**：phase170 工厂落地时 Assembly 同步切换（而非独立 D.1 清理 phase）
- **违反条款**：无（整理债清单 drift 非违规）；但登记 drift 本身作为"整理债清单与实然不一致"的证据
- **纠错链路**：phase208 Step 2 整理债.md D.1 表 drift 消除 + §消除顺序图划去
- **治理路径**：phase170 + phase208 协同（实施 phase170 / 登记补齐 phase208）—— "消化未登记"模式（与 phase201 `B.p201-drift` 行号 drift 同型）

#### 纪律.8 — phase227 G3 jobs 层 18 console 全 audit 化（**2026-04-22 phase227**）

- **触发**：phase226 分派 G3 Cron jobs console 清零 → Step 1 扫描 + 原则对照发现原 β 方向（phase194 判据 8 A 态 + 10 B 态保留）违反 Design #1/#3/#5 + Module #4
- **违反条款**：无（Path #6 停下报告 / 用户拍板 α 方向 / 非 agent 自决 scope 扩展）
- **纠错链路**：Step 1 原则对照 → Path #6 停下 → 报告 3 方向 → 用户决策 α → agent 重写 plans → 用户实施 Step 2 代码（+43 行 / 7 type / 18 audit / 双写）
- **关键 Finding**（候选 r13 Meta 升格）：phase194 "info log 运维可见保留"判据与 Design 原则冲突 → 修正为"业务状态迁移 / 失败事件 必 audit / console 作镜像 / 只有重复信息或纯调试 trace 可 console-only"
- **方法论贡献**：Path #6 + Path #7 联动首次实证（原则冲突 → 停下 → 归属核 → 用户决策）；§7.A 层级化登记第 2 次（runner phase179 + jobs phase227）；per-job lifecycle/error/warning/check 4 态命名族；phase224 §A3 候选 jobs 层部分消化链
- **合入 SHA**：`35459d1`（main / 2026-04-22）

#### 纪律.9 — phase232 Cron runner lifecycle audit（**2026-04-22 phase232**）

- **触发**：phase227 合入后 §7.A3 仍开放 "cron_runner_started/stopped 生命周期事件" → 分发表约定独立 phase 消化
- **违反条款**：无（最小形态 phase / 3 文件 +23 行 / 单一意图）
- **纠错链路**：分发表 phase232 独立 phase → agent Step 1 扫描 → 用户 Step 2 代码实施 → tsc + vitest 20 tests 全绿 → squash + ff merge
- **实装**：`cron_runner_started`（`start()` 实际触发时）+ `cron_runner_stopped`（`stop()` 实际触发时），幂等 no-op 路径不写；字符串字面量沿用 runner.ts 既有模式（不引 AUDIT_EVENTS 常量）；`jobs=${this.jobs.length}` 提供 context
- **合入 SHA**：`f28606e`（main / 2026-04-22）

#### 纪律.10 — phase278 §7.B 系统评估（r22 分支 C / 2026-04-24，design 本地 only）

- **scope**：r22 C §7.B 全模块评估；Cron 涉及 B.p173-1 降档判定
- **B.p173-1 终态合规降档**：α.1 声明式归属（jobs 物理位置 cron 模块 + 契约层归属声明）phase227 实施后确认为终态选择，非临时折衷 → 终态合规降档
- **本契约变更**：§7.B B.p173-1 节追加降档标注

#### 纪律.11 — phase329 contract-observer 物理搬迁（2026-04-26）

- **触发**：phase326 critical C3 / B.p173-1 升档条件满足（jobs/ 297 行 > 框架 124 行）
- **scope**：单一文件物理移动 `src/core/cron/jobs/contract-observer.ts` → `src/core/contract/jobs/contract-observer.ts` + 1 处 Assembly import 路径切换 + tests mock URL 同步
- **合入 SHA**：<待 Squash 后填>

### 7.D § numbering drift 表

| 位置 | 旧值 | 新值 | 原因 |
|---|---|---|---|
| §7.A6 关联（L449） | modules.md §22 | modules.md ~~§22~~ §23 | modules.md 重编号：Cron 从 §22 → §23 |
| head 摘要 | 极简 "> 应然承诺" | 完整 pattern（应然/实然/归属/依赖） | split propagation 统一格式 |

## 8. 测试覆盖

### 8.1 行为覆盖

按 §2 方法分组归类（现有测试路径，粗糙期无新增）：

- **constructor / lifecycle**
  - `CronRunner` 构造：**间接覆盖**（`tests/assembly/assemble.test.ts:93` mock `CronRunner: vi.fn(() => mockCronRunner)` 断言构造被调）
  - `start()` / `stop()`：**间接覆盖**（mockCronRunner `{ start: vi.fn(), stop: vi.fn() }` 断言被 Assembly 调用）
  - 幂等性（重复 start）：**零覆盖**（§7.A4）
- **tick / computeRunKey**
  - 3 种 schedule key 算法：**零覆盖**（§7.A4）
  - daily pending 态：**零覆盖**（§7.A4）
  - `enabled=false` 跳过：**零覆盖**
  - `running` Set 防重叠：**零覆盖**
- **parseSchedule**
  - `'hourly'` / `'daily:HH:MM'` / `'interval:Nm'`：**零直接覆盖**（§7.A5）；间接由 Assembly 测试通过 `parseSchedule: vi.fn((s) => s)` mock 掩盖，不测真实逻辑
  - unknown fallback：**零覆盖**
- **handler 异常隔离**
  - `.catch(err => console.error)`：**零覆盖**；§5.3 承诺"异常不扩散"无测试断言
- **Job handler 集成**
  - `runDeepDream` / `runRandomDream`：**直接覆盖**（`tests/core/cron/deep-dream.test.ts` / `random-dream.test.ts`）——测 job 内部逻辑不测调度
  - `runDiskMonitor` / `runLlmStats` / `runContractObserver`：**零直接单测**（归各业务模块）

### 8.2 §3 事件回链

§3.1 CronRunner 自产事件清单为空（§7.A3 登记）。

| # | event type | 回链测试 | 覆盖 |
|---|---|---|---|
| – | 无 CronRunner 自产事件 | – | – |
| 1 | `assemble_failed`（`module=cron_runner, phase=fs_construct`） | `tests/assembly/assemble.test.ts`（clawforumFs 构造失败路径） | 推测 ✓（需 Step 8 grep 核实） |
| 2 | `assemble_failed`（`module=cron_runner, phase=construct`） | 同上（CronRunner 构造失败） | 推测 ✓ |
| 3 | `assemble_failed`（`module=cron_runner, phase=start`） | 同上（start 抛出） | 推测 ✓ |

3 条 Assembly 关联事件实际测试覆盖由 `tests/assembly/assemble.test.ts` 的 `expectAssembleFailure` 系列覆盖（与 phase169 SkillRegistry L740/748 同型）；本契约引用不硬断言（归 Assembly 契约）。

### 8.3 测试缺口说明

- `CronRunner` class 无直接单测文件（§7.A4）
- `parseSchedule` fn 无直接单测（§7.A5）
- `computeRunKey` 3 schedule key 算法零断言
- `running` Set 并发保护行为零断言
- `handler .catch` 异常隔离行为零断言
- `tests/core/cron/deep-dream.test.ts` / `random-dream.test.ts` 只测 job 业务，不测调度器

粗糙期原则：不补测试，登记缺口到 §7.A4/A5；细化期新建 `tests/core/cron/runner.test.ts` 统一补。
