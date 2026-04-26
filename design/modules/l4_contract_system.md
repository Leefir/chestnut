---
module: ContractSystem
layer: L4
status: registered (phase160)
source: src/core/contract/manager.ts (1233 行)
tests: tests/core/contract*.test.ts + tests/cli/contract-events.test.ts
---

# L4 ContractSystem

契约的完整生命周期管理：创建、状态追踪、验收判定（脚本/LLM）、重试/升级、暂停/恢复/取消、归档。代码实体为单类 `ContractManager`（`src/core/contract/manager.ts:80`，1233 行）。

## 0. 头部

- **归属层**：L4（业务模块，依赖 L1-L3）
- **装配归属**：
  - 主路径：`Assembly.assemble()` 装配（`src/assembly/assemble.ts:192`），7 参数完整注入
  - 非主路径（B 类登记）：CLI / daemon / start 直 `new ContractManager(...)` 共 7 处，详见 §7 B.1
- **上游依赖**：

  **应然**（2026-04-26 修订 / 跟 modules.md ~~§20~~ §21 align，5 个）：
  - `FileSystem`（L1）
  - `AuditLog`（L1，承载 AuditWriter 接口）
  - `Messaging`（L2，承载 InboxWriter）
  - `ProcessExec`（L1，脚本验收）
  - `TaskSystem`（L4，KD#30 后 LLM 验收经其调度 verifier 子代理）
  - **应然不依赖**：`LLMService`（KD#30 验收 LLM 调度挪 TaskSystem）/ `Tools(verifier)`（验收 SubAgent 由 TaskSystem 装配）/ `SkillSystem`（review_request 已剥离至 ContractRetro）/ `SubAgent class` 直 import（改 TaskSystem 调度）

  **实然**（以 `manager.ts` L7-L24 import 为准 / 8 依赖 + jobs/ 子目录 1 文件 / 待 §7.B drift 登记同步）：
  - `FileSystem`（L1，必需）— `foundation/fs/types`
  - `LLMService`（L2，可选）— `foundation/llm`（应然移除）
  - `AuditWriter`（L1，必需 `audit` + 可选 `auditWriter`）— `foundation/audit/writer`（**phase239 变更**：`monitor?: Logger` 删除，`audit: AuditWriter` 新增为必选 4 参）
  - `ToolRegistryImpl`（L3，可选，作 verifierRegistry）— `core/tools/registry`（应然移除）
  - `SubAgent` class（L3，硬依赖）— `core/subagent/agent`（应然改 TaskSystem 调度）
  - `InboxWriter`（L2，硬依赖）— `foundation/messaging`
  - `exec / execFile / ProcessExecError`（L1）— `foundation/process-exec`
  - `CONTRACT_VERIFIER_SYSTEM_PROMPT`（提示词）— `prompts/subagent`（应然 verifier 装配挪 TaskSystem 后随之挪走）
  - `ReportResultTool`（L3）— `core/tools/report-result`（同上）
  - 常量：`LOCK_MAX_RETRIES / LOCK_RETRY_DELAY_MS / LOCK_STALE_TIMEOUT_MS / CONTRACT_SCRIPT_TIMEOUT_MS / DEFAULT_LLM_IDLE_TIMEOUT_MS / DEFAULT_MAX_STEPS` — `src/constants.ts`
  - `src/core/contract/jobs/contract-observer.ts`（71 行 / cron 调度触发 / 周期扫描 claws/ 目录 + CLI self-call + 写 motion inbox）
- **被谁调用**：
  - `Assembly`（主路径，注入给 Runtime.contractManager）
  - `Runtime`（经 Assembly 注入，phase161 明确）
  - CLI commands：`start`（motion 启动） / `contract`（create/pause/resume/log） / `daemon`（review_request 临时读 YAML）
  - agent 工具层：`done` 工具（经 ToolExecutor / Runtime）
- **资源独占**：
  - `contract/active/` / `contract/paused/` / `contract/archive/` 目录
  - 每契约目录下 `progress.json` + `progress.lock`

## 1. 职责边界

### 做

**应然**（2026-04-26 修订 / 跟 modules.md ~~§20~~ §21 align）：

1. 契约 CRUD：`create / loadActive / loadPaused / cancel / pause / resume`
2. subtask 状态迁移 + 异步验收后台任务（`_runAcceptanceInBackground`）
3. 脚本验收（`execFile`，超时 `CONTRACT_SCRIPT_TIMEOUT_MS`）
4. LLM 验收（**经 TaskSystem 调度 verifier 子代理** / KD#30）—— ContractSystem 不再 own SubAgent 构造
5. `retry_count` / `last_failed_feedback` / `escalated_at` 状态机 + escalation（事件 `contract_escalation`）
6. `progress.json` 文件锁（acquireLock / unlinkStaleLock / releaseLock / withProgressLock）
7. 内部 `moveToArchive`（完结或取消后移至 `contract/archive/`）
8. inbox 反写验收结果（成功 / 拒绝 / 错误三路径，结构化 feedback）
9. `onNotify` 回调（`contract_created` / `subtask_completed` / `acceptance_failed`）
10. **`contract_completed` 事件发布**（publisher-subscriber 协议 / 订阅方含 ContractRetro 等 / 替代原 review_request 整合内置职责）

**实然 drift**（待 §7.B 登记同步）：

- 第 4 项 LLM 验收当前内部 `new SubAgent`（manager.ts:L1179 / §5 #2 / §7.B.2 已登记 KD#30 应然 drift）
- **jobs/ 子目录新增**：`src/core/contract/jobs/contract-observer.ts`（71 行）物理迁入 ContractSystem，但业务语义归属已在 modules.md 声明（ContractSystem 契约活跃度监测），不新增职责漂移
- 第 10 项 `contract_completed` 事件发布协议未实装（应然新增；当前仅 `onNotify` 回调内含 `acceptance_failed`/`subtask_completed`，无独立 `contract_completed` publisher channel）
- 原第 10 项 **review_request 整合**：应然已剥离至 ContractRetro 新模块（2026-04-26 modules.md 修订）；实然 `handleReviewRequest` 方法仍在 `manager.ts`（phase175 实装），代码迁移待新 phase 接 ContractRetro 模块化

### 不做

- task 队列调度 → **TaskSystem**
- SubAgent 内部 run 状态机 / idle 判定 / timeout 细节 → **SubagentSystem**
- inbox 读取 → **InboxReader / Messaging**
- tool 注册 → **ToolRegistry**
- contract 目录 identity 分支（motion vs claw）→ **Assembly**
- 契约 schema 版本迁移（仅 `CONTRACT_DEFAULTS.schema_version = 1` 静态常量）

## 2. 接口

### 2.a ctor — 行为契约四要素（§7.a）

```ts
new ContractManager(
  clawDir: string,
  clawId: string,
  fs: FileSystem,
  audit: AuditWriter,          // phase239: 必选，替代已删除的 monitor?: Logger
  llm?: LLMService,
  verifierRegistry?: ToolRegistryImpl,
  auditWriter?: AuditWriter,   // 保留：Phase 230 已有的可选写入字段
)
```

- **输入**：4 必填（clawDir / clawId / fs / audit） + 3 可选（llm / verifierRegistry / auditWriter）
- **输出**：ContractManager 实例（不持资源，仅引用）
- **边界**：
  - `audit`：必选，17 处 monitor 迁移调用 + 3 个新生命周期事件均走此字段（`this.audit.write(...)`）
  - `llm` 未注入 → LLM 验收路径 `runLLMAcceptance` 抛 / 走脚本路径
  - `verifierRegistry` 未注入 → 脚本验收找不到工具抛
  - `auditWriter` 未注入 → Phase 230 已有的 `this.auditWriter?.write(...)` 调用降级 no-op（与 `audit` 字段并存；Assembly 路径两者传同一实例）
- **失败**：ctor 不抛；降级/失败延迟到方法调用体现

### 2.b 11 公共方法

| # | 方法 | 行 | 签名 | 职责摘要 |
|---|---|---|---|---|
| 1 | `setOnNotify` | 111 | `(cb: (type: string, data: Record<string, unknown>) => void) => void` | 注入 onNotify 回调（Assembly / Runtime 用） |
| 2 | `loadActive` | 248 | `(): Promise<Contract \| null>` | 扫 `contract/active/`，返回首个（约定单活跃契约） |
| 3 | `loadPaused` | 297 | `(): Promise<Contract \| null>` | 扫 `contract/paused/` |
| 4 | `create` | 339 | `(contractYaml: ContractYaml): Promise<string>` | 新建契约目录 + progress.json + audit `contract_created` |
| 5 | `getProgress` | 432 | `(contractId: string): Promise<ProgressData>` | 读 progress.json（不加锁） |
| 6 | `completeSubtask` | 445 | `(params: { contractId, subtaskId, output, ... }): Promise<void>` | 核心：锁 + 验收分派（脚本/LLM）+ 重试/升级 + archive |
| 7 | `pause` | 953 | `(contractId, checkpointNote): Promise<void>` | active → paused + audit `contract_paused` |
| 8 | `resume` | 977 | `(contractId): Promise<Contract>` | paused → active + audit `contract_resumed` |
| 9 | `cancel` | 1001 | `(contractId, reason): Promise<void>` | 取消 + archive + audit `contract_cancelled` |
| 10 | `isComplete` | 1033 | `(contractId): Promise<boolean>` | 判定所有 subtask 完成 |
| 11 | `readContractYamlRaw` | 1050 | `(contractId): Promise<string>` | 跨 claw 读原始 YAML（daemon review_request 用） |

> **无公共 `archive` 方法**；归档逻辑在内部 `moveToArchive` 由 completeSubtask / cancel 串联。

#### 2.b.0 应然接口增补（2026-04-26 修订 / 跟 modules.md ~~§20~~ §21「定义的协议」align）

**应然新增** —— `contract_completed` 事件发布接口（publisher-subscriber 协议）：

```ts
// 应然：装配期注入订阅者 / 运行期冻结
type ContractCompletedEvent = {
  contractId: string;
  completedAt: string; // ISO timestamp
  finalStatus: 'completed' | 'cancelled';
};

setOnContractCompleted(cb: (event: ContractCompletedEvent) => void): void;
```

- **订阅方**：ContractRetro（消费 → 触发回顾整合）/ 其他可扩展订阅者
- **publisher-subscriber 同型**：与 `setOnNotify` / LLMService `LLMEventSink` / Gateway `interrupt` 同型 —— 单向触发不构成循环
- **触发位置**（应然）：`completeSubtask` LLM/脚本路径完结时 + `isComplete` 确认路径（沿用 §3 现有 `contract_completed` audit 事件触发点）

**应然修订** —— LLM 验收方法签名应然不再含 SubAgent 构造：

- 现 `runLLMAcceptance` 内部 `new SubAgent(...)` → 应然改为 `await this.taskSystem.dispatch({ type: 'verifier_subagent', context: {...} })`
- ContractSystem 不再持有 `LLMService` / `verifierRegistry` / `SubAgent class` import
- TaskSystem 单点装配 verifier（持 LLMService + Tools + verifier prompt）

**实然**：上述两接口均未实装（详 §1 实然 drift + §5 #2）；待新 phase 实施代码迁移。

### 2.b.1 review_request 整合（**phase175 实装 / phase184 切换 / phase188 B-3 清理完成**；4/4 全链路闭合）

**归属登记**（2026-04-21 `B.p172-3` 升档完成）：按 M1/M2/M3 三原则，review_request 应由 ContractSystem 发起（contract 完成后的后置动作，资源主体是 contract YAML + by-contract 索引）。**当前实然**：实装已在 `manager.ts` `handleReviewRequest` 方法落地（phase175），daemon.ts:118-239 130 行代码暂留；契约 `l6_daemon.md` §2.5 / §5.5 保留"归属已迁 ContractSystem / 代码暂留"登记至 phase177 清理。

**phase175 实装接口**：

```ts
interface MotionReviewContext {
  motionFs: FileSystem;
  motionBaseDir: string;
  motionAudit: AuditWriter;
  clawsBaseDir: string;
}

async handleReviewRequest(
  contractId: string,
  ctx: MotionReviewContext,
): Promise<void>;
```

**行为承诺**（与 daemon.ts:118-239 原路径等价）：
1. 读 motion fs 的 `clawspace/pending-retrospective/by-contract/<contractId>.json`（4 类 best-effort skip：ENOENT / 非 JSON / targetClaw 非法 / 读错）
2. 加载 target claw 的 contract YAML（临时 `new ContractManager(clawDir, targetClaw, clawFs)` + `readContractYamlRaw`；`B.p175-1` 登记）
3. 扫 motion 的 `clawspace/dispatch-skills`（内部 `new SkillRegistry`；`B.p175-2` 登记，与 phase169 `B.p169-1` 同根）
4. 加载 mining task messages（2 类 best-effort 退化：tasks/results 不存在 / session messages 缺失）
5. 构造 retro prompt + `writePendingSubagentTaskFile` 派发 retro subagent（失败 → early return，保留 by-contract 留重试）
6. cleanup by-contract 索引（best-effort `.catch(warn)`）

**实施节注记**：
- console 前缀 `[contract]`（沿用 ContractManager 既有 9 处 console.warn 模块风格；review_request 从 daemon.ts 迁出时自然对齐，不登记偏差）
- 临时 `new ContractManager` 读 target claw YAML（`B.p175-1` 登记，phase177 清理时考虑抽 static helper）
- 临时 `new SkillRegistry` 扫 dispatch-skills（`B.p175-2` 登记，与 phase169 `B.p169-1` 同根）

**调用方迁移状态**（phase188 合入 main `db42781` 后，4/4 全链路闭合）：daemon.ts `onInboxMessages` 经由 `contractManager.handleReviewRequest(contractId, reviewCtx)` 完成分发（L115-138 顶层构造 + 转调，3 行接触面）；旧 118 行实现 + 6 import + 契约 §2.5 / §5.5 章已删；`l6_daemon.md §7.A4c` 清零；`§7.B.p172-3` 标 4/4 完成。

**测试覆盖**：`tests/core/contract-review-request.test.ts` 覆盖 happy path + best-effort 分支（详见 §8 测试覆盖）。

**拆 phase 实施状态**（应然 → 实然；**4/4 完成闭环**）：
1. ✓ phase174 契约登记（§2.b.1 应然接口 + §1 职责扩 + Daemon 契约 §2.5 / §5.5 标注 `B.p172-3`）
2. ✓ phase175 `handleReviewRequest` 实装 + 测试（main `b087e89`；8 it 覆盖）
3. ✓ phase184 Daemon `onInboxMessages` 切换调新接口（main `25f9707`；daemon.ts +38 行 + daemon-command.test.ts +4 it）
4. ✓ **phase188 B-3 清理**（main `db42781`；daemon.ts -124 行 + `l6_daemon.md §2.5 / §5.5` 整章删 + `§7.A4c` 清零 + `§7.B.p172-3` 标 4/4 完成）

### 2.c 导出类型

- `ContractYaml`（manager.ts:L34） — **未经 index.ts 导出**，CLI 直引 manager.ts
- `ProgressData`（manager.ts:L56） — index.ts 导出
- `AcceptanceResult`（manager.ts:L72） — index.ts 导出
- `ContractManager` class — index.ts 导出（Step 3 将加 `createContractManager` 工厂并行导出）

## 3. 审计事件

14 事件类型 / 17 触发点（phase239 后 `this.audit.write(...)` 与 `this.auditWriter?.write(...)` 并存；前者必选注入，后者可选）：

| # | 事件类型 | 触发行 | 触发语义 | 载荷摘要 | 写入字段 |
|---|---|---|---|---|---|
| 1 | `contract_lock_cleanup_failed` | 205 | unlinkStaleLock 真故障 | reason, err | auditWriter |
| 2 | `contract_created` | ~460 | create 成功（auditWriter 详细版） | contractId, `subtasks=N`, `title=…` | auditWriter |
| 2b | `CONTRACT_CREATED` | ~461 | create 成功（audit phase239 版） | `contractId=…` | **audit** |
| 3 | `subtask_completed` | ~584 | 脚本验收通过 | — | auditWriter |
| 4 | `contract_completed` | ~612 | 脚本路径完结 | contractId | auditWriter |
| 4b | `CONTRACT_ACCEPTANCE_STARTED` | ~531 | 异步验收启动 | contractId, subtaskId | **audit** |
| 4c | `CONTRACT_UPDATED` | ~626 | subtask 完成（同步路径） | contractId, subtaskId, status | **audit** |
| 5 | `subtask_completed` | ~713 | LLM 验收通过 | — | auditWriter |
| 6 | `acceptance_passed` | ~721 | LLM 验收 pass | `${contractId}/${subtaskId}` | auditWriter |
| 7 | `contract_completed` | ~739 | LLM 路径完结 | contractId | auditWriter |
| 8 | `acceptance_failed` | ~770 | LLM 验收 reject | contractId/subtaskId + feedback | auditWriter |
| 9 | `contract_escalation` | ~803 | retry_count ≥ 阈值 | contractId/subtaskId | auditWriter |
| 10 | `contract_paused` | ~971 | pause 成功 | contractId, checkpoint | auditWriter |
| 11 | `contract_resumed` | ~994 | resume 成功 | contractId | auditWriter |
| 12 | `contract_cancelled` | ~1016 | cancel 成功 | contractId, reason | auditWriter |
| 13 | `contract_completed` | ~1092 | isComplete 确认路径 | contractId | auditWriter |
| 14 | `acceptance_timeout` | ~1190 | LLM 验收超时 | contractId/subtaskId | auditWriter |

> **phase239 新增（`audit` 字段）**：CONTRACT_CREATED (#2b) / CONTRACT_ACCEPTANCE_STARTED (#4b) / CONTRACT_UPDATED (#4c) 三个生命周期事件。行号含波浪号因 phase230→239 行号漂移，以 context 字符串定位为准。

## 4. 上游依赖（精确清单）

**应然**（2026-04-26 修订 / 5 依赖 / 跟 modules.md ~~§20~~ §21 align）：

| 依赖 | 层 | 可选 | 用途 |
|---|---|---|---|
| FileSystem | L1 | 否 | progress.json / contract.yaml / lock / archive |
| AuditLog (AuditWriter) | L1 | 否 | 14+ 类 audit 事件 |
| Messaging (InboxWriter) | L2 | 否 | 反写验收结果 |
| ProcessExec (execFile) | L1 | 否 | 脚本验收进程 |
| TaskSystem | L4 | 否 | LLM 验收经其调度 verifier 子代理（KD#30） |

**应然移除**：`LLMService`（KD#30 挪 TaskSystem）/ `Tools(verifierRegistry)`（同上）/ `SkillSystem`（review_request 已剥离 ContractRetro）/ `SubAgent class` 直 import（改 TaskSystem 调度）

**实然**（待 §7.B drift 登记同步）：

| 依赖 | 层 | 可选 | 用途 | 降级行为 |
|---|---|---|---|---|
| FileSystem | L1 | 否 | progress.json / contract.yaml / lock / archive 移动 | — |
| LLMService | L2 | 是 | `runLLMAcceptance` | 未注入 LLM 验收路径抛 |
| AuditWriter (`audit`) | L1 | **否**（phase239 必选） | 17 处 monitor 迁移调用 + CONTRACT_CREATED/ACCEPTANCE_STARTED/UPDATED | ctor 参数必填，无降级 |
| AuditWriter (`auditWriter`) | L1 | 是（Phase 230 原字段） | Phase 230 已有的 14 触发点写入 | 未注入 → `this.auditWriter?.write(...)` no-op |
| ToolRegistryImpl (verifier) | L3 | 是 | 脚本验收工具查找 | 未注入 → 脚本验收抛 |
| SubAgent class | L3 | ~~否（硬 import）~~ 应然移除 | LLM 验收实例化（L~1180） | **关键决策 #30**：应然改经 TaskSystem 调度，不再直接 new SubAgent |
| TaskSystem | L4 | 否（应然新增） | LLM 验收经 TaskSystem 调度 verifier 子代理 | 关键决策 #30 |
| InboxWriter | L2 | 否（内部构建） | 反写验收结果 | — |
| execFile / ProcessExecError | L1 | 否 | 脚本验收进程 | 超时 `CONTRACT_SCRIPT_TIMEOUT_MS` |
| **jobs/ 子目录** | — | — | — | — |
| ProcessExec (`execFile`) | L2 | 否 | contract-observer CLI self-call | — |
| Messaging (`notifyInbox`) | L2 | 否 | contract-observer 写 motion inbox | — |
| FS (`NodeFileSystem`) | L2 | 否 | contract-observer 读 claws/ 目录 + 写 state file | — |
| Audit (`AuditWriter`) | L2 | 否 | contract-observer 不直接写 audit（仅 `notifyInbox` 内部触发 motion audit） | — |

> **jobs/ 子目录依赖说明**：上述 4 项为 contract-observer.ts 内部所需，与 manager.ts 核心 API 物理分离，不破坏 `ContractManager` 公开接口。按"core 模块 + jobs 子目录"分述。见 §5 新增 jobs handler 协议节。

> **与 modules.md #18 现字段差距**：现列 `FileWatcher / ProcessExec / SubagentSystem / Messaging / AuditLog`。真实代码：
> - `FileWatcher` 未 import / 未使用 → **删**
> - `Messaging` → 更精确为 `InboxWriter`
> - `SubagentSystem` → 更精确为 `SubAgent class`（硬 import）
> - `ProcessExec` / `AuditLog` 保留但名字对齐 `execFile` / `AuditWriter`
> - 应补 `LLMService` / `Logger` / `ToolRegistryImpl(verifier)`
>
> Step 5 做 modules.md 修正；本契约不改 modules.md。

## 5. 不可消除耦合（显式登记）

**应然新增 #0**（2026-04-26 修订）：**`contract_completed` 事件 publisher-subscriber 协议**

- ContractManager 定义事件 schema + `setOnContractCompleted(cb)` 装配期注入接口
- 订阅方含 ContractRetro 等（runtime 装配期 wire-up）
- **合规性**：单向触发 publisher-subscriber 同型于 `onNotify` / LLMEventSink / Gateway interrupt —— 不反向调 ContractManager / 不构成循环
- 注入时机：装配期一次注入、运行期冻结（同 §Module Logic #6）
- **实然 drift**：未实装（见 §2.b.0 应然增补 / §1 第 10 项实然 drift）

---

1. **onNotify 回调注入**（`setOnNotify`，L111）：
   - 注入时机约定：**装配期一次注入、运行期冻结**（Assembly 在装配 Runtime 之前调 `setOnNotify`；Runtime 启动后不再改）。此约定满足 §Module Logic #6 "依赖结构稳定：运行时模块间依赖关系不可变" —— 运行期"依赖关系"视为已冻结
   - **合规性**：与 LLMService `LLMEventSink` / Gateway `interrupt` 协议注入同型——ContractManager 定义协议（`(type: string, data: ...) => void`），Assembly/Runtime 装配期注入实现。**publisher-subscriber 模式**：ContractManager 触发 → 订阅者消费 → **不反向调 ContractManager** → 不形成循环（区别于 phase163 消除的 SubagentSystem ↔ TaskSystem 真循环——后者是业务语义 self-amplifying）
   - 类型弱点：回调签名 `(type: string, data: Record<string, unknown>)` 用 string + Record 弱类型，type 枚举值与 data 形状不由编译器校验 → 违反 §Module Logic #9 "不可消除耦合优先编译器检查" → §7 B.9 登记
   - 运行期回调方自担错误 → §7 B.6
2. **ContractManager → `new SubAgent(...)`**（manager.ts:L1179）：LLM 验收直实例化子代理，绕过 TaskSystem。继承 phase159 `l4_subagent_system.md` §7 B 类"双实例化路径" → §7 B.2
3. **progress.lock 文件锁**（L135-L241，4 私有方法）：跨进程语义由 FS rename+exclusive 保证；超时/腐败兜底见 §3 事件 1 + §7 B.4/B.5
4. **execFile 脚本验收**：外部进程契约，超时 `CONTRACT_SCRIPT_TIMEOUT_MS`，错误统一 `ProcessExecError`
5. **AuditWriter 内部兜底**（L841 `_runAcceptanceInBackground` / L864 `_writeAcceptanceError`）：`this.auditWriter ?? new AuditWriter(this.fs, path.join(this.clawDir, 'audit.tsv'))` —— 装配归属漂移风险 → §7 B.3
6. **jobs handler 协议（Cron 调度接口）**（`src/core/contract/jobs/contract-observer.ts`）：
   - ContractSystem 提供 `runContractObserver(opts: ContractObserverOptions)` 函数，由 Cron 调度框架通过 Assembly 注入 handler 闭包调用
   - 耦合界面：`ContractObserverOptions` 接口（`clawforumDir` + `motionInboxDir`）+ 函数签名 `Promise<void>`
   - 周期触发由 Cron 调度框架注入；handler 函数 + opts 参数协议为 ContractSystem ↔ Cron 的不可消除耦合界面
   - 合规性：Cron 定义 `CronJob` 协议（publisher-subscriber 形态 B），ContractSystem 提供协议实现，无循环依赖

## 6. 配置常量归属

所有锁/超时常量集中于 `src/constants.ts`（非本模块独有，由 ContractSystem / TaskSystem / SubagentSystem 共享）：

- `LOCK_MAX_RETRIES`
- `LOCK_RETRY_DELAY_MS`
- `LOCK_STALE_TIMEOUT_MS`
- `CONTRACT_SCRIPT_TIMEOUT_MS`
- `DEFAULT_LLM_IDLE_TIMEOUT_MS`（LLM 验收超时基线）
- `DEFAULT_MAX_STEPS`（LLM 验收最大步数基线）

本模块独有：

- `CONTRACT_DEFAULTS`（manager.ts:L28） — `{ schema_version: 1, auth_level: 'auto' }`

## 7. 与现状的差距

### 7.a A 类（违背原则，细化期修）

筛选标准：静默失败导致**业务语义丢失或关键状态不可恢复**，且**无 audit 接力**。

- ~~**A.1 — progress.json 腐败静默跳过**~~
  - ~~位置：`manager.ts:L275`（loadActive）/ `L319`（loadPaused）~~
  - **phase230 清零**（`CONTRACT_PROGRESS_CORRUPTED` / L308/L356 / main `959559d`）

- ~~**A.2 — moveToArchive 失败静默**~~
  - ~~位置：`manager.ts:L619`（脚本验收完结） / `L746`（LLM 验收完结）~~
  - **phase230 清零**（`CONTRACT_MOVE_ARCHIVE_FAILED` / L675/L808 / main `959559d`）

- ~~**A.3 — inbox 反写验收结果失败静默**~~
  - ~~位置：`manager.ts:L884`（`_writeAcceptanceError`） / `L906`（reset subtask status after acceptance error）~~
  - **phase230 清零**（`CONTRACT_ACCEPTANCE_INBOX_FAILED` L952 + `CONTRACT_ACCEPTANCE_RESET_FAILED` L977 / main `959559d`）

> **§7.A 3/3 全清零 milestone**（phase230 `959559d` / 2026-04-22）

<!-- A.4 onNotify 回调循环耦合：**2026-04-20 修订判据后撤回**

初版登记：我根据"必须消除循环耦合"立场把此条升 A 类。
修订后判据：onNotify 是 publisher-subscriber 模式（ContractManager 触发 → Runtime/Assembly 消费写 stream → 不反向调 ContractManager），**不构成循环**——与 Gateway interrupt / LLMService LLMEventSink 同型合规。
phase163 消除的 SubagentSystem ↔ TaskSystem 是真循环（业务 self-amplifying：spawn → taskSystem → SubAgent → 再调 spawn 回到起点）；onNotify 仅**单向触发信号**给订阅者。
撤回此 A.4 条目；B.6（console.warn 错误吞并）+ B.9（回调签名弱类型）作为独立偏差继续登记。
详 §5 #1 新措辞。-->



### 7.b B 类（已登记，可容忍）

- **B.1 — src/ 非主路径 `new ContractManager` / `createContractManager`**（phase160 扫描；**phase239 已补全 audit 参数**）
  - `src/cli/commands/daemon.ts` — review_request 临时读 YAML（phase239 补传 audit）
  - `src/cli/commands/start.ts` × 2 — motion 启动特权路径（phase239 补传 audit）
  - `src/cli/commands/contract.ts` × 4 — CLI create/pause/resume/log 直操（phase239 补传 `new AuditWriter(...)`）
  - `src/core/contract/manager.ts` handleReviewRequest 内临时实例（phase239 补传 audit）
  - `src/core/contract/index.ts` createContractManager 工厂（phase239 改为 audit 必选参）
  - `src/assembly/assemble.ts`（phase239 改用 auditWriter 实例同时传 audit 与 auditWriter 两参）
  - **现状**：全部已传入合法 audit 实例（**phase239 `9754984` 补全**）
  - 治理方向：CLI → Runtime/Assembly 收拢专题（细化期）

- **B.2 — LLM 验收 `new SubAgent`**（manager.ts:L1179）
  - 继承 phase159 `design/modules/l4_subagent_system.md` §7 B 类双实例化路径
  - **应然已定**（关键决策 #30，2026-04-23）：LLM 验收改经 TaskSystem 调度 verifier 子代理，ContractSystem 不再直接 `new SubAgent`
  - **实然 drift**：manager.ts 仍直接 `new SubAgent(...)` 构造 verifier
  - 治理方向：验收路径走 TaskSystem 调度（代码实施 phase 待定）

- **B.3 — `auditWriter` 可选字段 + `audit`/`auditWriter` 双字段并存**（**phase239 升档更新**）
  - 原状（phase230）：`auditWriter?: AuditWriter` 未注入时内部 `new AuditWriter(fs, audit.tsv)` 静默兜底
  - **phase239 现状**：新增 `audit: AuditWriter`（必选）承接 17 处 monitor 迁移调用；`auditWriter` 可选字段保留（Phase 230 已有写入点不动）。Assembly 路径两者传同一实例，CLI 路径 `audit` 必传、`auditWriter` 不传
  - 残余风险：`audit` 与 `auditWriter` 双字段并存，audit 事件分散在两条写入路径，语义上同为 `AuditWriter` 但触发机制不同（前者必选直写，后者可选 `?.write`）
  - 治理方向：B.2 Monitor 废止工程 sub-phase 2/3 完成后，`auditWriter` 全部写入点统一迁至 `audit`，届时删除 `auditWriter` 字段（phase240s+）

- **B.4 — unlinkStaleLock 失败**
  - 位置：manager.ts:L239 `auditWriter?.write(AUDIT_EVENTS.CONTRACT_LOCK_UNLINK_FAILED, ...)`
  - 判定：**phase230 升纯 audit**（console.warn 已删 / `CONTRACT_LOCK_UNLINK_FAILED` 接力 / 合规）

- ~~**B.5 — L171 lock 超时 force clear console.warn 无同点 audit**~~
  - **phase230 清零**（`CONTRACT_LOCK_CLEARED` L195 补齐 / console.warn 已删 / 治理方向实现）

- **B.6 — onNotify 错误吞并**（4 处）
  - 位置：manager.ts:L471 / L632 / L767 / L831 — `auditWriter?.write(AUDIT_EVENTS.CONTRACT_NOTIFY_FAILED, ...)`
  - 判定：**phase230 console.warn 替换为 `CONTRACT_NOTIFY_FAILED` audit**；回调方自担错误设计关切仍为 B 类保留（不升 A）

- ~~**B.7 — L413 rollback contract dir 失败 console.warn**~~
  - **phase230 清零**（`CONTRACT_ROLLBACK_FAILED` L459 / console.warn 已删 / 治理方向实现）

- **B.8 — ContractManager 1233 行单类**
  - 内部职责：lock / acceptance / state-machine / archive 可拆 3-4 文件
  - 判定：粗糙期保留，细化期 phase171+ 大文件拆分专题

- **B.9 — onNotify 回调签名弱类型违反 #9**
  - 位置：manager.ts:L111 `setOnNotify(cb: (type: string, data: Record<string, unknown>) => void)`
  - 违反原则：§Module Logic #9 "不可消除耦合优先编译器检查"
  - 现状：3 种 type 字符串（`contract_created` / `subtask_completed` / `acceptance_failed`）与 data 形状由调用方/回调方口头约定，编译器无法对齐
  - 治理方向：改为 discriminated union `type NotifyEvent = { type: 'contract_created', data: {...} } | ...`（细化期）

- **B.10 — 依赖抽象接口缺失**（**phase239 更新**：`monitor?: Logger` 已删）
  - 位置：`manager.ts` ctor 参数 `audit: AuditWriter` / `verifierRegistry?: ToolRegistryImpl` / `auditWriter?: AuditWriter`
  - 违反原则：§Module Logic #8 耦合界面最小 + #9 编译器优先"依赖抽象"
  - 现状：ctor 三参数直接依赖具体实现类（非接口），工厂 `createContractManager` 继承此依赖
  - 后果：调用方换实现需模拟整个类而非实现接口；跨模块类型耦合（ContractSystem ↔ tools/registry.ts / audit/writer.ts 具体实现）
  - 发现来源：phase160 合入后代码审查 F4（纪律复盘 Q4 手感判据缺）
  - 治理方向：抽 `IToolRegistry` / `IAuditWriter` / `ILogger` 接口，ctor + 工厂签名改依赖接口；需跨 ContractSystem + TaskSystem + SubagentSystem 协同（同类问题已在 3 模块 ctor 出现）→ phase171+ 抽象层专题

#### B.p175-1 — 临时 `new ContractManager` 读 target claw YAML

- **现状**：`handleReviewRequest` Part 2.1 `new ContractManager(clawDir, targetClaw, clawFs)` + `await clawContractManager.readContractYamlRaw(contractId)`
- **为何合规**：
  - 保 daemon.ts:161-173 原路径语义等价
  - `this` 是 motion 侧 ContractManager，不能直接读 target claw 的 contract YAML；需为 target claw 单独构造实例
  - 不引入新抽象（避免 scope 蔓延）
- **owner**：phase175
- **计划 phase**：phase177 清理 daemon.ts 时一并考虑 —— 候选抽象：
  - α：`ContractManager.readYamlAtPath(fs, contractId)` static 方法
  - β：暴露 `ContractManager.getForClaw(clawDir, clawId)` factory helper
- **升档条件**：出现第 2 处"跨 claw 读 contract"需求 → 转 §7.A 抽 static helper

#### B.p175-2 — 临时 `new SkillRegistry` 扫 dispatch-skills

- **现状**：`handleReviewRequest` Part 2.2 `new SkillRegistry(ctx.motionFs, 'clawspace/dispatch-skills')` + `loadAll()` + `formatForContext()`
- **为何合规**：保 daemon.ts:177-187 原路径语义等价；与 phase169 `B.p169-1` 同根（phase169 登记 4 处临时 `new SkillRegistry`，本 phase 为第 5 处）
- **owner**：phase175（同根于 phase169）
- **计划 phase**：合 phase169 `B.p169-1` 统一清理（独立 phase，phase 号 TBD）；届时改 `createSkillRegistry` 工厂 + SkillRegistry 构造期接入
- **升档条件**：phase169 `B.p169-1` 升档时本条一并升档

#### B.p230-1 — ContractQuery 协议移除（关键决策 #29，2026-04-23）

- **应然**：ContractSystem 不实现也不消费任何 capability 协议。verifier 子代理通过 `read` 工具自读 `contract/active/{id}/progress.json`，或由 ContractSystem 创建时将验收信息写入 context/prompt。
- **现状**：无代码级 drift（ContractSystem 当前未实现 `ContractQuery` 协议，Tools 模块的 capability 协议也未落地代码）。但 l3_tools.md §5.1 曾声明 `IContractQuery` 供 done 工具消费，现已废止。
- **治理路径**：确认 done 工具直接调 ContractManager 方法（不经过协议），无需改动 ContractSystem 代码。
- **phase278 确认**：**合规降档**（ContractQuery 从未实现；done 工具直调 ContractManager；原登记前提条件不成立）。

### 7.c C 类（原则对照合规，登记供反向查）

- **#1 独立可变职责**：契约生命周期为独立变更源（与 TaskSystem 任务队列 / SubagentSystem run 状态机 / Messaging inbox 读写 变更源不同）
- **#2 业务语义归属**：契约状态迁移 / 验收判定 / escalation 由 ContractManager 发起
- **#3 资源归属**：`contract/active/|paused/|archive/` 由 ContractManager 独占；CLI 直操路径通过实例间接访问（B.1 登记）
- **#5 底层不预设上层**：7 依赖均为 L1-L3，不反向依赖 Assembly / Runtime / Daemon；`setOnNotify` 回调是 publisher-subscriber 模式（ContractManager 定义协议、Assembly/Runtime 注入实现），与 LLMService `LLMEventSink` / Gateway `interrupt` 同型合规（单向触发，不构成循环）
- **#6 依赖结构稳定**：构造期注入、运行期不变；`setOnNotify` 为装配期一次注入 + 运行期冻结的显式回调注入模式，合规
- **#7 耦合界面稳定**：本 phase 不改 11 公共方法签名
- **#8 耦合界面最小**：11 方法对应 11 业务能力

### 7.D 关键决策映射表（modules.md 迁移）

从 `design/modules.md` §关键设计决策章节迁移（2026-04-26 主会话；后续清理阶段重构）。原 KD 编号保留供对账。

- **KD#8（原 modules.md）ContractSystem 低频操作走 CLI**：pause/resume/cancel 不占工具位,智能体需要时通过 exec 调 CLI
- **KD#30（原 modules.md）ContractSystem LLM 验收经 TaskSystem 调度**（2026-04-23）：ContractSystem 不直接 `new SubAgent` 跑 LLM 验收，改为经 TaskSystem 调度 verifier 子代理。理由：
    - **D1/D4 合规**：验收子代理崩溃后可被 TaskSystem 恢复，不丢失
    - **M1 合规**：子代理调度是 TaskSystem 的职责，不应散落在 ContractSystem
    - **M8 合规**：消除 ContractSystem 对 SubAgent 构造接口的知识（TaskSystem 单点管理 SubAgent 构造）
    - 附带消除 TaskSystem 对 ContractManager 的不必要依赖（原透传给 SubAgent options，done 工具由 ContractSystem 导出、内部持有引用，不需 TaskSystem 透传）  
  关联模块：l4_task_system.md（cross-ref / 主登记在本模块）

---

## 8. 测试覆盖

| 文件 | 规模 | 覆盖 |
|---|---|---|
| `tests/core/contract.test.ts` | 11 it | CRUD + loadActive/loadPaused |
| `tests/core/contract_manager.test.ts` | 44 it | create / completeSubtask 脚本路径 / pause / resume / cancel / escalation / audit writer 事件 / phase230 +21 audit 断言 / **phase239 +3 生命周期断言**（CONTRACT_CREATED / CONTRACT_ACCEPTANCE_STARTED / CONTRACT_UPDATED） |
| `tests/core/contract_manager_llm.test.ts` | 20 it | LLM 验收 + SubAgent + llm 未注入降级 / phase230 +15 audit 断言 / **phase239 mockMonitor → mockAudit 迁移** |
| `tests/core/contract-concurrency.test.ts` | 7 it | `withProgressLock` 并发 / phase230 +4 / **phase239 mockAudit 补注入** |
| `tests/core/contract-review-request.test.ts` | 8 it | handleReviewRequest 审查路径 |
| `tests/cli/contract-events.test.ts` | ~3 it | CLI 入口触发 audit 事件链路 |
| `tests/core/builtins.test.ts` | 5 处 new | done 工具路径旁证 |
| `tests/core/done_tool.test.ts` | 1 处 new | done 工具单独 |
| `tests/helpers/runtime-deps.ts` | 1 处 new | 测试装配辅助 |

### 7.Phase 纪律（各 phase 改动登记）

#### phase160 — L4 ContractSystem 粗糙重构合入（初始契约注册）

- 契约 9 节初版 + `createContractManager` 工厂；合入后审查补 B.10 依赖抽象缺失
- main `（phase160 SHA）`

#### phase175/184/188 — review_request 归属迁移（4 phase 链路）

- phase175：`handleReviewRequest` 实装 + 8 it（main `b087e89`）
- phase184：Daemon 调用方切换（main `25f9707`）
- phase188：B-3 清理 daemon.ts -124 行（main `db42781`）；§7.B.p172-3 标 4/4 完成

#### phase239 — B.2 Monitor 废止 sub-phase 1（r14 分支 C / main `9754984` / 2026-04-22）

- **scope**：`contract/manager.ts` 17 处 `.monitor?.log()` → `this.audit.write()` + ctor `monitor?: Logger` → `audit: AuditWriter`（必选）
- **新增 3 个 audit 常量**（`src/foundation/audit/events.ts` `--- Contract ---` 节末尾）：
  - `CONTRACT_CREATED`（`contract_created`）— create 成功生命周期（L461，`this.audit.write`）
  - `CONTRACT_ACCEPTANCE_STARTED`（`contract_acceptance_started`）— 异步验收启动（L531）
  - `CONTRACT_UPDATED`（`contract_updated`）— subtask 完成状态更新（L626）
- **L602/L612 warn 处置**：判定为低频调试 trace → 降级 `console.warn`（B 类，Step 12 登记）
- **N1 漂移**：Step 6 映射表行号基于 Phase 230 之前代码；Phase 230 +25 行导致行号偏移，Step 6 实施前已重新按 context 字符串核对
- **call site 更新**：9 处 src/ 创建点全部补传 `audit` 参数（5 处 CLI/daemon + 1 处工厂 + 1 处 Assembly + 1 处内部临时实例 + 1 处 createContractManager 工厂签名）
- **测试**：6 文件全量 mock 迁移（mockMonitor → mockAudit）+ contract_manager.test.ts +3 生命周期 it；全套 1250 it 通过
- **B.2 工程进度**：73 calls / 7 文件 → sub-phase 1 完成 17/73；task/system.ts 44 calls + 其余 12 calls 延后

#### phase230 — §7.A 3/3 全清零（r12 分支 E / main `959559d` / 2026-04-22）

- **scope**：`src/core/contract/manager.ts` 25 console.X → 16 `CONTRACT_*` audit type + 2 β双写保留
  - β双写 1：L420 `CONTRACT_ARCHIVE_STARTED` + `console.log`（归档信息性 / 运维可见性）
  - β双写 2：L1191 `CONTRACT_ACCEPTANCE_SCRIPT_STARTED` + `console.log`（验收脚本信息性）
- **新增 16 audit 常量**（`src/foundation/audit/events.ts` `--- Contract ---` 节）：
  - `contract_lock_cleared` — lock 超时 force clear（L195）
  - `contract_lock_unlink_failed` — unlinkStaleLock 失败（L239）
  - `contract_progress_corrupted` — progress.json 腐败（L308/L356 / §7.A1 清零）
  - `contract_archive_started` — 归档动作开始（L416 β）
  - `contract_rollback_failed` — create 回滚失败（L459 / §B7 清零）
  - `contract_notify_failed` — onNotify 错误（L471/L632/L767/L831 / §B6 console 替换）
  - `contract_move_archive_failed` — moveToArchive 失败（L675/L808 / §7.A2 清零）
  - `contract_acceptance_inbox_failed` — 验收结果 inbox 反写失败（L952 / §7.A3 清零）
  - `contract_acceptance_reset_failed` — 验收后 subtask 状态重置失败（L977 / §7.A3 清零）
  - `contract_acceptance_script_started` — 验收脚本启动（L1187 β）
  - `contract_retro_index_failed` — 回顾 by-contract 索引读失败（L1348/1356/1366/1381）
  - `contract_retro_yaml_failed` — 回顾 contract YAML 读失败（L1401）
  - `contract_retro_skill_failed` — 回顾 dispatch-skills 读失败（L1419）
  - `contract_retro_mining_failed` — 回顾 mining task 消息读失败（L1438/1444）
  - `contract_retro_schedule_failed` — 回顾调度失败（L1474）
  - `contract_retro_cleanup_failed` — 回顾清理失败（L1483）
- **§7.A milestone**：A.1 + A.2 + A.3 全清零 / B.5 + B.7 治理方向实现 / B.4 升纯 audit / B.6 console 替换
- **测试**：5 文件 +40 it（contract_manager +21 / contract_manager_llm +15 / concurrency +4）

#### phase278 纪律 — §7.B 系统评估（r22 分支 C / 2026-04-24，design 本地 only）

- **scope**：r22 C §7.B 全模块评估；ContractSystem 涉及 B.p230-1 降档判定
- **B.p230-1 合规降档**：Path #1 确认 `ContractQuery` 类型从未在代码库中创建；done 工具直调 `ContractManager` 方法；原登记前提条件不成立 → 合规降档
- **本契约变更**：§7.B B.p230-1 节追加降档标注

#### phase329 — contract-observer 物理迁入 ContractSystem（r34 分支 D / 2026-04-26）

- **scope**：`src/core/cron/jobs/contract-observer.ts` → `src/core/contract/jobs/contract-observer.ts` 物理搬迁
- **原因**：B.p173-1 升档条件满足（jobs/ 297 行 > Cron 框架 124 行）+ critical C3 应然层级合规强制
- **改动点**：
  1. §0 头部实然节新增 jobs/ 子目录文件登记
  2. §1 实然 drift 新增 jobs/ 子目录说明
  3. §4 上游依赖实然表新增 jobs/ 子目录 4 项依赖（ProcessExec / Messaging / FS / Audit）
  4. §5 不可消除耦合新增 "jobs handler 协议（Cron 调度接口）" 节
  5. §7.Phase 本条目登记
- **行为/接口/磁盘路径不变**：`STATE_FILE` 仍写 `motion/status/contract-observer-state.json`；`runContractObserver` 签名不变；audit 事件无新增
- **合入 SHA**：<待 Squash 后填>

### 7.E § numbering drift 表

| 位置 | 旧值 | 新值 | 原因 |
|---|---|---|---|
| §0 头部（L21） | modules.md §20 | modules.md ~~§20~~ §21 | modules.md 重编号：ContractSystem 从 §20 → §21 |
| §1 职责边界（L53） | modules.md §20 | modules.md ~~§20~~ §21 | 同上 |
| §2.b.0 接口增补（L124） | modules.md §20 | modules.md ~~§20~~ §21 | 同上 |
| §4 上游依赖（L229） | modules.md §20 | modules.md ~~§20~~ §21 | 同上 |
