# Clawforum Design Practices

## §B.vitest-env-mutation-race — phase 714 closure（δ 拍板）

- **claim**：14 test mutation site / 10 test file 用 `process.env.X = ...` mutate / vitest pool='threads' / 0 已知 CI flake
- **业务决策 4 候选**：α `pool: 'forks'` / β `pool: 'vmThreads'` **rule out**（vm 不虚拟化 process.env）/ γ envSnapshot helper / δ accept + design row
- **28 原则**：3 candidate（α/γ/δ）无 dominant / β rule out
- **拍板**：δ（accept + design row only）
  - 理由：0 已知 CI flake；Tier 1 副发现 2 site STALE 推翻（实读已满足）；per-test discipline 已是现状 culture；worker_threads env copy 独立；YAGNI；回滚 0 cost
- **副发现 2 site Tier 1 必修（不论拍板）**：claw-send-confinement afterAll restore + spawn-defaults undefined 守卫确认 → **STALE 推翻**（实读已满足）
- **升档触发条件**：未来某 CI 真出现 process.env 跨 worker flake 时，可无损启动 α（`pool: 'forks'`）或 γ（envSnapshot helper）
- **closure**：phase 714 Step F(STALE) + G.3(δ) + H
