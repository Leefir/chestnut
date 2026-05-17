# phase 942 Cluster 3 site #2 config schemas ε-inject 落地

## 触发
user 2026-05-17「模块反向依赖往往提示有重要问题，要逐个查。我们开始一个一个来」 → Cluster 3 反向依赖逐个 deep audit 第 2 站（继 phase 936 site #1 真闭后）。

## 实然状态
`src/foundation/config/schemas.ts` **8 site L2→L3/L4/L5/L6 reverse imports**（实测 grep verified、phase 827/925 scope 5 漏 watchdog 3 N+1 实证）。

## Deep Audit Derive
- **M#1 业务唯一职责**：Config 业务 = parse/validate user config、不 own owner defaults。当前 Config 越权 ❌
- **M#2 业务语义归属**：「默认 maxSteps = 1000」是 agent-executor 决策、不属 Config
- **M#5 模块依赖单向 + 底层模块不预设上层模块语义**：L2 Config 0 L3/L4/L5/L6 import 应然
- **M#9 优先编译期 check**：ConfigDefaults interface 注入 > import literal
- **「设计架构、职责归属不合理时停下来重构」**：Config 当前 own defaults 不合理 → 真重构

## 候选 Enumeration
| 候选 | 描述 | M#5 align | M#9 编译期 check | drift risk | 总难度 |
|---|---|---|---|---|---|
| α-revert | hardcode duplicate values in schemas.ts | ✅ 0 reverse | ✅ literal | ❌ drift risk | low |
| β-accept (phase 827) | maintain 8 reverse imports | ❌ literal violation | ⚠️ import 表达但非「编译期 check」最优 | ✅ 0 drift | 0 |
| γ-L0-hoist | 移 8 const 到 L0 types/constants.ts + owner re-export | ✅ 0 reverse | ✅ literal | ✅ | mid — 违 M#3 ❌ |
| δ-strip-defaults | schemas 删 .default()、caller 自治 defaults | ✅ 0 reverse | ⚠️ caller 各自 supply、易 drift | ❌ caller-side drift | high |
| **ε-inject (dominant)** | NEW `assembly/config-defaults.ts` + schemas factory pattern `createXxxSchema(defaults)` | ✅ 0 reverse | ✅ ConfigDefaults interface 编译期 check | ✅ 0 drift (assembly 单点聚合) | mid-high |

**dominant ε-inject** — 5 原则全 align + drift risk = 0 + 编译期 check 优于 import literal + assembly 单点聚合（M#9 显式表达 + A.7 同模式 mirror phase 936）。

## Step B 实施
- NEW `src/assembly/config-defaults.ts` 装配期聚合 8 owner const + `CONFIG_DEFAULTS: ConfigDefaults`
- `foundation/config/schemas.ts` factory pattern：删 8 cross-layer imports、保 5 L2 same-layer llm-orchestrator imports、`export const Xxx` → `export function createXxx(defaults)` × 4 schemas
- `foundation/config/crud.ts` + `adapters.ts` + `cli/commands/config.ts` caller cascade
- tests update
- 反向 1/1：tsc + test 全 PASS、src restore → tsc fail

## 验收
- [x] NEW assembly/config-defaults.ts 创建
- [x] foundation/config/schemas.ts factory pattern 转换完成 + ConfigDefaults interface 加
- [x] crud.ts + adapters.ts + cli/commands/config.ts caller cascade
- [x] grep 反向 `from.*core/|from.*watchdog/` in foundation/config/schemas.ts = 0 hits ✓
- [x] tsc PASS
- [x] bun test 全 PASS (227 files, 2009 tests)
- [x] 反向 1/1：loadGlobalConfig() 无参数 → TS2554
- [x] 单 commit per `feedback_pr_one_commit_rule`
- [x] merged to main (fast-forward)

## Cross-ref
- `coding plan/phase942/Phase 942 总览.md`
- `coding plan/phase942/Step A — design row + memory.md`
- `coding plan/phase942/Step B — code ε-inject 实施.md`
- `design/modules/l4_async_task_system.md` audit.P1.async-4b
- `design/modules/l2_config.md` audit.P1.config-reverse-1

## 副发现
- `feedback_m5_violation_deeper_signal` 升档条件 (4) third-defer-equivalent P0 升档 N=2 累实证（phase 936 site #1 N=1 + 本 phase site #2 N=2）
- `feedback_dispatch_site_count_grep_required` Tier 2 active N+1 累实证（phase 827/925 scope 漏 watchdog 3 site）
- `feedback_accepted_stable_src_drift_monitoring` Tier 2 active scope -8 capture
- Cluster 3 实然 reverse import：site #2 closed-by-plan 后 13 → 5 site（site #3 claw-permissions 8 path + site #4 verifier-job 2 const 待后续 phase）
