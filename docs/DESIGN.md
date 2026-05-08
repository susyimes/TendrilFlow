# TendrilFlow 总设计

TendrilFlow 是一个面向本地编码 Agent 的任务协作工作台。它的第一版目标是把 Codex CLI 组织成一个可启动、可分配任务、可观察沟通、可交接上下文、可审查结果的本地多 agent 系统。

## 1. 产品定位

TendrilFlow 解决的问题是：当用户同时使用多个 coding agents 处理真实代码仓库任务时，如何让它们像一个小团队一样协作，而不是散落在多个不可追踪的会话里。

它不是通用 AI Agent 应用开发平台，也不是低代码 workflow builder。

核心定位：

- 本地优先
- 面向 coding agents
- 以任务为中心
- 以 Agent Room 展示沟通
- 以文件保存 transcript
- 以结构化交接保证上下文不丢

第一版 provider 是 Codex CLI。后续可以通过 adapter 接入 Kimi、Gemini 或其他 CLI/SDK agent。

## 2. MVP 已确认范围

MVP 包含：

- local web app
- 本地 Task Board
- Agent Launcher
- Agent Room
- Orchestrator
- Codex CLI Adapter
- Work Agent
- Observe Agent
- Debug Agent
- Review Agent
- Coordinator Agent
- 文件存储 transcript
- 默认可见的 agent 沟通
- 结构化讨论、决策和交接记录

MVP 不包含：

- GitHub Issues、Linear、Jira 等外部任务板接入
- 通用低代码 agent builder
- 知识库/RAG 平台
- agent 私有草稿区
- 原始 chain-of-thought 暴露
- 云端多用户协作

## 3. 核心模块

### Local Web App

第一版 UI 是 local web app。

它应提供三个主要区域：

- Agent 列表：展示 agent 名称、角色、状态和当前任务。
- Task Board：创建任务、分配 owner、查看任务状态。
- Agent Room：展示某个任务的群组沟通、事件流、交接卡片、review comments 和最终报告。

### Agent Launcher

负责启动和管理 agent 进程。

第一版只需要支持 Codex CLI：

- 配置 agent 名称和角色
- 配置工作目录
- 配置启动命令
- 记录运行状态
- 停止或重启 agent

后续 provider 只能通过 adapter 接入，避免污染 orchestrator 和 UI。

### Task Board

任务只来自本地 Task Board 或用户直接下发。

MVP 不接入外部任务板。

任务状态：

- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`
- `failed`

每个任务至少包含：

- `task_id`
- `title`
- `description`
- `status`
- `owner_agent_id`
- `participant_agent_ids`
- `created_at`
- `updated_at`
- `room_path`

### Agent Room

每个任务拥有一个 Agent Room。

Agent Room 是用户观察多 agent 协作的主要界面。所有重要沟通默认可见，并写入 transcript 文件。

支持用户通过 `@agent-name` 召唤指定 agent，例如：

```text
@coordinator 帮我拆分这个任务
@review-agent 请 review 当前变更
@debug-agent 看一下失败原因
@codex-worker 从交接卡片继续执行
```

### Orchestrator

Orchestrator 是 TendrilFlow 的协调核心。

职责：

- 管理任务和房间
- 启动和停止 agent
- 路由用户消息和 agent 消息
- 维护 agent 状态
- 收集 agent 输出
- 写入 transcript 文件
- 触发讨论、review、debug 和交接流程
- 保持 provider 逻辑隔离在 adapter 层

### Agent Adapter

Agent Adapter 封装 provider 特有逻辑。

第一版实现 Codex CLI Adapter。

统一能力：

- `start_agent`
- `send_message`
- `stream_output`
- `stop_agent`
- `get_status`
- `attach_task_context`
- `emit_event`

## 4. 角色模型

### Work Agent

执行任务的主要 agent。

职责：

- 理解任务
- 制定计划
- 执行代码或自动化工作
- 运行必要检查
- 汇报进度
- 输出最终结果

### Observe Agent

观察任务状态和上下文。

职责：

- 观察 active tasks
- 汇总当前进展
- 发现阻塞
- 为其他 agent 准备上下文
- 帮助用户理解系统整体状态

### Debug Agent

定位失败原因。

职责：

- 检查日志和命令输出
- 检查 task event stream
- 分析失败原因
- 给出修复建议
- 帮助 blocked task 恢复

Debug Agent 只能使用可观察 trace，不读取原始 chain-of-thought。

### Review Agent

审查变更和产物。

职责：

- review 代码变更
- 识别风险
- 检查测试是否充分
- 留下可执行 comments
- 给出 accept、revise 或 reject 建议

### Coordinator Agent

Coordinator Agent 进入 MVP。

职责：

- 拆分任务
- 推荐 agent 分配
- 组织 agent 讨论
- 总结决策
- 推动交接
- 解决 owner 冲突

Coordinator 不是自动独裁调度器。MVP 中它应给出建议和组织流程，用户仍保留最终控制权。

## 5. 数据和文件存储

Transcript 使用文件存储。

推荐目录结构：

```text
.tendrilflow/
  agents/
    agents.json
  tasks/
    {task_id}/
      task.json
      events.jsonl
      handoffs/
      reports/
```

### `events.jsonl`

`.tendrilflow/tasks/{task_id}/events.jsonl` 是 Agent Room transcript 的主事件流。

每行是一条 JSON event。

建议字段：

```json
{
  "event_id": "evt_...",
  "task_id": "task_...",
  "type": "agent_message",
  "actor": {
    "kind": "agent",
    "id": "agent_codex_worker"
  },
  "timestamp": "2026-05-08T00:00:00Z",
  "content": {
    "text": "当前计划如下..."
  }
}
```

MVP 事件类型：

- `user_message`
- `agent_message`
- `system_event`
- `tool_call_summary`
- `status_change`
- `decision_record`
- `handoff_note`
- `review_comment`
- `final_report`

## 6. 协作流程

### 基础任务流

1. 用户在 local web app 创建任务。
2. 用户选择 agent，或让 coordinator 给出分配建议。
3. Orchestrator 创建 task room 和 transcript 文件。
4. Work Agent 执行任务并持续写入事件。
5. 用户在 Agent Room 观察过程。
6. 用户或 Coordinator 触发 debug、review、讨论或交接。
7. 任务完成后生成 final report。
8. Task Board 状态变为 `done`。

### 讨论机制

讨论用于处理方案选择、阻塞、review 分歧和任务归属问题。

讨论结束必须形成 `decision_record`：

- 选择的方案
- 放弃的方案
- 决策理由
- 下一步 owner

### 交接机制

任务从一个 agent 转给另一个 agent 时，必须生成 handoff card。

Handoff card 内容：

- 当前目标
- 已完成内容
- 当前状态
- 阻塞点
- 相关文件、命令、链接或日志
- 已做出的假设
- 下一步建议
- 风险和注意事项

接手 agent 必须先确认理解交接内容，再继续执行。

## 7. Trace 策略

TendrilFlow 不暴露原始 chain-of-thought。

产品展示的是可审计 trace：

- 任务理解摘要
- 执行计划
- 决策记录
- 讨论摘要
- 工具调用摘要
- 命令输出摘要
- 文件变更摘要
- review comments
- 交接卡片
- 最终报告

这能提供足够透明度，同时避免依赖私有推理过程。

## 8. 与 Coze Studio 的区别

Coze Studio 是通用 AI Agent 应用开发平台，重点是创建 agent、配置资源、编排 workflow，并发布应用。

TendrilFlow 的重点不是创建通用 AI 应用，而是管理本地 coding agents 的协作执行过程。

差异可以概括为：

- Coze Studio 面向 agent app builder，TendrilFlow 面向 local agent ops。
- Coze Studio 聚焦 agent 应用构建，TendrilFlow 聚焦真实代码任务执行。
- Coze Studio 强调 workflow 和资源配置，TendrilFlow 强调 task room、handoff、review 和可恢复执行。
- Coze Studio 的 agent 多运行在平台抽象中，TendrilFlow 管理外部 CLI/SDK agent 进程。

## 9. 验收场景

- 用户能启动 local web app。
- 用户能启动一个 Codex work agent。
- 用户能创建本地任务并分配给 agent。
- 用户能在 Agent Room 看到 transcript。
- `events.jsonl` 能持续记录房间事件。
- 用户能 `@coordinator` 触发任务拆分或分配建议。
- 用户能 `@review-agent` 触发 review。
- 用户能 `@debug-agent` 触发失败分析。
- 任务交接时系统能生成 handoff card。
- 接手 agent 能基于 handoff card 继续执行。
- 任务完成后能生成 final report。
