# OMC Research Execution Plan

本计划基于对 [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) 的 research，目标不是复制 OMC，而是把其中已验证的可靠性机制，转译成 TendrilFlow 自己的群组式 agent harness 能力。

## 1. 研究结论

OMC 的强项是 Claude Code 内的 skill/CLI orchestration：

- `/team` 和 `omc team` 提供团队编排入口。
- Team 以阶段化 pipeline 推进：`team-plan -> team-prd -> team-exec -> team-verify -> team-fix`。
- tmux CLI workers 支持 Codex/Gemini/Claude 等真实 CLI worker。
- `.omc/skills/` 和 `~/.omc/skills/` 提供可复用技能沉淀。
- session summary、replay logs、HUD、worker heartbeat、worktree mode 提供可观察性和恢复能力。

TendrilFlow 的差异化应保持为：

- local Web App，而不是 slash-command-first。
- 以 group / Agent Room 为中心，而不是隐藏 pipeline。
- ACP-first，legacy CLI 兜底，而不是 Claude Code-first。
- 以可见沟通、任务房间、结构化 trace 和用户/Host 控制为核心。

## 2. 产品原则

- **Host playbook 可见**：阶段化推进应是 Host Agent 的可见 skill，而不是隐藏 workflow。
- **状态可恢复**：任务 owner、claim、依赖、阻塞、健康状态都要落到文件，不能只存在于会话上下文。
- **隔离优先**：后续多 agent 同时改代码时，优先用 worktree 隔离，避免互相覆盖。
- **能力属于 agent**：Core 只提供通信、状态、控制平面和 trace；测试、审查、调试、总结仍由 agent 的 tools/skills 完成。
- **可靠性来自组织机制**：用分工、验证、复核、证据和恢复机制降低幻觉，而不是只依赖更强模型。

## 3. 分阶段执行

### Phase 1: Reliability Baseline

目标：先把可靠性最小闭环落到现有 MVP。

- 新增 Host 默认 playbook：
  - `plan`
  - `clarify`
  - `execute`
  - `verify`
  - `fix`
  - `finalize`
- task 增加可恢复执行字段：
  - `depends_on`
  - `blocked_by`
  - `claim`
  - `playbook_stage`
- agent 增加健康状态摘要：
  - `idle`
  - `active`
  - `stale`
  - `detached`
  - `stopped`
  - `failed`
- Agent Room route 到 agent 时写入 task claim。
- UI 展示 agent health。

### Phase 2: Host-Orchestrated Task Graph

目标：让 Host 可以把任务拆成依赖图，而不是只写一条 decision record。

- Host 输出 `host.task_graph` 事件。
- Task Board 支持子任务和依赖可视化。
- 阻塞任务显示 `blocked_by`。
- Host 可以建议重新分配 stale/failed agent 的任务。
- 用户可以接受或修改 Host 生成的 task graph。

### Phase 3: Skill Layer

目标：让群组记忆和经验变成可复用能力。

- Workspace skill 目录：`.tendrilflow/workspaces/{workspace_id}/skills/`
- Group skill 目录：`.tendrilflow/workspaces/{workspace_id}/groups/{group_id}/skills/`
- Host / review / debug / handoff skills 可独立保存和编辑。
- Agent context 注入匹配 skill 摘要。
- 后续支持从成功任务中提炼 skill。

### Phase 4: Worker Isolation

目标：让多个 agent 能并行改代码但不互相污染。

- 可选 per-agent worktree。
- Group 保持统一 coordination root。
- Agent cwd 可指向自己的 worktree。
- Dirty worktree 不能被自动删除。
- Host 负责汇总合并建议，用户确认后合并。

### Phase 5: Replay And Reliability Analytics

目标：把 trace 变成复盘和改进工具。

- Task summary。
- Agent contribution summary。
- Decision/risk summary。
- Agent replay timeline。
- Stale/failure/retry metrics。
- Host 复盘建议。

## 4. 当前执行范围

Phase 1、Phase 2、Phase 3 和 Phase 4 已落地。当前继续执行 Phase 5 的最小闭环：

- 新增 `GET /api/tasks/{task_id}/replay`。
- 从 `events.jsonl` 和相关 agent session logs 生成 task replay。
- 复盘包含 task summary、agent contribution summary、decision/risk summary、merged replay timeline、reliability metrics 和 Host suggestions。
- Web UI 在 Agent Room 提供“任务复盘”入口。
- Replay 只从现有文件 trace 派生，不改变主存储模型。
- Replay 不展示原始 chain-of-thought，也不自动判定任务真实正确性。

不做：

- 不实现完整 skill 管理 UI。
- 不实现完整可视化任务图编辑器。
- 不实现自动 merge。
- 不实现 OS 级沙箱。
- 不引入数据库。
- 不实现跨 workspace 的全局可靠性 dashboard。
- 不实现自动 memory promotion 或自动 skill 提炼。
- 不改变现有 `.tendrilflow/workspaces/` 主存储模型。

## 5. 验收标准

- README/设计文档可链接到本计划。
- 新任务默认带 `depends_on`、`blocked_by`、`claim`、`playbook_stage`。
- 任务依赖只能引用同一 workspace/group 内任务，且不能引用自己。
- route 到 agent 时会写入 claim lease。
- `GET /api/state` 返回 agent health。
- UI 成员列表展示 agent health。
- Host role response 明确使用默认 playbook。
- 默认 workspace/group skill 文件会自动创建。
- API 可以读取和更新 skill 文件。
- Agent context 包含匹配 skill 摘要。
- worktree agent 启动前会创建独立 Git worktree。
- dirty worktree 会阻止自动删除 agent。
- Agent context 包含 worktree isolation 信息。
- API 可以返回任务 replay analytics。
- UI 可以从 Agent Room 打开任务复盘。
- Replay 包含任务摘要、贡献、风险、timeline、指标和 Host 建议。
- Replay 不展示原始 chain-of-thought。
- `npm test` 全部通过。
