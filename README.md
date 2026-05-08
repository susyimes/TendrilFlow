# TendrilFlow

[English README](./README.en.md) | [总设计](./docs/DESIGN.md)

TendrilFlow 是一个面向本地编码 Agent 的任务协作工作台。

名字来自“触手向不同方向伸展并处理任务”的意象：每个 agent 都可以承担一个清晰角色，围绕任务进行可见讨论，必要时完成结构化交接，并留下可审计的工作轨迹。

## 产品定位

TendrilFlow 的目标不是构建通用 AI Agent 应用平台，而是把 Codex CLI、Kimi、Gemini 或其他 CLI/SDK agent 组织成一个可控制、可观察、可交接的本地任务团队。

第一阶段以 Codex CLI 作为主要执行 agent。Agent 通信优先使用 Agent Client Protocol（ACP）；当某个 agent 不支持 ACP 或 ACP adapter 不稳定时，再通过 legacy CLI adapter 兜底。后续 provider 应通过 adapter 扩展，而不是让上层产品逻辑绑定某一个 agent 实现。

核心能力包括：

- 通过本地 Web App 启动和配置 agents
- 在本地 Task Board 创建、分配和推进任务
- 直接 `@agent` 或选中 agent 下发任务
- 以群组形式展示 agent 间沟通
- 支持 agent 间结构化讨论和交接
- 内置 work、observe、debug、review、coordinator 等角色
- 优先通过 ACP 连接 coding agents
- 使用文件保存 task room transcript
- 展示可审计工作轨迹，包括计划、决策、工具调用、状态变化、讨论、review 和交接记录

## MVP 已确认决策

- 第一版 UI：local web app。
- Transcript 存储：文件存储，主事件流为 `.tendrilflow/tasks/{task_id}/events.jsonl`。
- Agent 沟通可见性：默认全部进入 Agent Room，对用户可见。
- Coordinator role：进入 MVP，负责组织讨论、拆分任务、建议分配和推动交接。
- 外部任务板：v1 不接入 GitHub Issues、Linear、Jira 等系统，任务只来自本地 Task Board 或用户直接下发。
- Agent transport：优先使用 ACP；不支持 ACP 的 agent 通过 legacy CLI adapter 接入。

## 核心体验

TendrilFlow 应该像一个 agent 工作指挥室。

用户创建任务后，可以把任务分配给一个或多个 agent，并在任务房间里看到执行过程。Agent 可以讨论方案、请求协助、交接任务、发起 review，并最终产出任务报告。

用户始终保留控制权：

- 可以启动、停止和配置 agent
- 可以创建、分配、重分配任务
- 可以在任务房间里 `@` 指定 agent
- 可以查看沟通、执行和决策轨迹
- 可以决定结果是否接受、是否需要 review、是否重试

## 主要模块

### Agent Launcher

负责启动和管理 agent 进程。

第一版重点是启动 ACP-compatible agent 进程或 Codex CLI legacy session，并控制基础配置：

- agent 名称
- agent 角色
- 工作目录
- 模型或 provider 设置
- 环境变量
- 权限或执行模式
- 启动命令
- 运行状态

### Task Board

负责任务创建、分配和进度追踪。

任务状态建议先保持简单：

- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`
- `failed`

每个任务应包含：

- 标题
- 描述
- 当前 owner agent
- 参与 agents
- 状态
- 相关文件或链接
- 房间 transcript
- 交接记录
- 最终报告

### Agent Room

每个任务对应一个群组房间。

房间用于展示任务协作过程：

- 用户消息
- agent 消息
- 系统事件
- 工具调用摘要
- 任务状态变化
- 讨论过程
- 决策记录
- 交接卡片
- review comments
- 最终任务报告

用户可以用类似下面的方式召唤指定 agent：

```text
@review-agent 请 review 当前变更
@debug-agent 看一下为什么任务失败
@coordinator 帮我拆分这个任务并安排执行顺序
@codex-worker 从交接卡片继续执行
```

### Orchestrator

负责任务和 agent 的协调。

Orchestrator 应负责：

- 创建和管理任务房间
- 路由消息到对应 agent
- 跟踪 agent 状态
- 收集 agent 进程输出
- 将 ACP session updates 或 legacy CLI 输出归一化为 TendrilFlow events
- 将 transcript 写入本地文件
- 约束角色边界
- 判断何时需要讨论、交接或 review
- 将 provider 相关逻辑隔离到 adapter 内部

### Agent Adapter

负责 provider 相关接入。

第一版 adapter 分两类：

- ACP Adapter：首选路径，用于连接支持 Agent Client Protocol 的 coding agents。
- Legacy CLI Adapter：兜底路径，用于连接暂时没有稳定 ACP 接入的 CLI agent。

ACP 只负责 TendrilFlow 和具体 agent 之间的通信传输。Task Board、Agent Room、讨论、交接、review 和 transcript 仍然属于 TendrilFlow 自己的产品模型。

统一 adapter 接口建议支持：

- 启动 agent
- 发送消息
- 流式读取输出
- 停止 agent
- 获取状态
- 附加任务上下文
- 发出结构化事件

ACP Adapter 应把 `initialize`、`newSession`、`prompt`、`cancel`、session update、tool call、agent plan 等协议事件转换为 TendrilFlow 内部事件。

## Agent 角色

### Work Agent

主要执行角色。

职责：

- 理解被分配的任务
- 制定并更新计划
- 执行任务
- 运行必要检查
- 汇报进度
- 产出最终结果

### Observe Agent

上下文和观察角色。

职责：

- 观察任务状态
- 总结当前工作
- 发现阻塞
- 判断是否需要协助
- 为其他 agent 准备上下文
- 维护跨任务和跨房间的全局视图

### Debug Agent

失败分析角色。

职责：

- 检查日志、命令输出和任务事件
- 定位可能失败原因
- 给出修复建议
- 协助其他 agent 从 blocked 状态恢复

Debug agent 应基于可观察 trace 工作，而不是依赖原始私有思维链。

### Review Agent

审查角色。

职责：

- review 代码变更
- 检查任务产物
- 识别风险
- 判断测试是否充分
- 留下可执行 review comments
- 建议接受、修改或拒绝

### Coordinator Agent

MVP 内置的协调角色。

职责：

- 拆分大型任务
- 推荐 agent 分配
- 组织讨论
- 总结决策
- 推动交接
- 解决任务归属冲突

## 沟通机制

Agent 间沟通默认应对用户可见。

核心模型是 task room，类似一个群聊房间。所有重要任务沟通都进入这个房间，让用户看到多 agent 如何推进任务。

支持的消息类型：

- `user_message`
- `agent_message`
- `system_event`
- `tool_call_summary`
- `status_change`
- `decision_record`
- `handoff_note`
- `review_comment`
- `final_report`

这样用户看到的不只是最终答案，也能看到 agent 群组如何讨论、决策、交接和完成任务。

## 讨论机制

Agent 应能围绕方案和风险进行讨论。

适合触发讨论的场景：

- 任务存在多个可行方案
- agent 被阻塞
- 即将发生任务交接
- review agent 不认可当前实现
- coordinator 需要决定任务归属

讨论结束时应产出一条简短决策记录：

- 选择的方案
- 被放弃的替代方案
- 决策理由
- 下一步 owner

## 交接机制

交接是一等流程。

当任务从一个 agent 转移给另一个 agent 时，系统应生成交接卡片。

交接卡片应包含：

- 当前任务目标
- 已完成内容
- 当前状态
- 已知阻塞点
- 相关文件、命令、链接或日志
- 已做出的假设
- 建议下一步
- 风险和注意事项

接手 agent 应先确认理解交接内容，再继续执行。

## 推理与 Trace 策略

产品不应暴露原始 chain-of-thought。

TendrilFlow 应展示的是可审计推理轨迹：

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

这能让用户获得足够透明度和控制权，同时不依赖原始私有推理过程。

## 与 Coze Studio 的区别

Coze Studio 更像一个通用 AI Agent 应用开发平台，重点是创建 agent、配置资源、编排 workflow，并发布到业务应用。

TendrilFlow 不做通用低代码 agent builder。它的重点是管理已经存在的本地 coding agents，把 Codex CLI、Kimi、Gemini 等工具组织成一个能围绕真实代码仓库执行任务、讨论、交接、review 和恢复的协作工作台。

## ACP 集成策略

ACP 是 TendrilFlow 的首选 agent transport，而不是 TendrilFlow 的全部架构。

TendrilFlow 自己保留任务、房间、角色、交接和 trace 模型；ACP 只用于标准化连接外部 coding agents。

推荐架构：

```text
Local Web App
  -> TendrilFlow Orchestrator
  -> Agent Adapter Layer
  -> ACP Agent / Legacy CLI Agent
```

这样可以让 Gemini CLI、Kimi CLI、Codex ACP adapter、Copilot CLI 等 ACP-compatible agents 以统一方式接入，同时保留对普通 CLI agent 的兼容。

参考资料：

- [Agent Client Protocol Introduction](https://agentclientprotocol.com/get-started/introduction)
- [ACP Agents Registry](https://agentclientprotocol.com/get-started/agents)
- [Gemini CLI ACP Mode](https://geminicli.com/docs/cli/acp-mode/)
- [GitHub Copilot CLI ACP server](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server)

## MVP 流程

1. 用户在 local web app 创建任务。
2. 用户把任务分配给一个 Codex work agent，或由 coordinator 建议分配。
3. TendrilFlow 创建任务房间和本地 transcript 文件。
4. Work agent 开始执行，并持续发出进度事件。
5. 用户可以在房间里观察 transcript。
6. 用户可以在需要时 `@debug-agent`、`@review-agent` 或 `@coordinator`。
7. Agents 在任务房间里讨论阻塞、方案或 review 结果。
8. 如果任务 owner 变化，当前 agent 创建交接卡片。
9. 接手 agent 确认交接并继续执行。
10. 任务完成后，房间生成最终报告，任务进入 `done`。

## 第一版范围

第一版应保持足够小：

- local web app
- 文件存储 transcript
- ACP Adapter 作为首选 agent transport
- Legacy CLI Adapter 作为兼容兜底
- Codex CLI integration
- 本地 Task Board
- 手动创建任务
- 手动启动 agent
- 手动 `@agent` 路由
- Coordinator 进入 MVP
- 任务房间 transcript
- 结构化交接卡片
- review 和 debug 作为可配置 agent profiles

第一版不做：

- GitHub Issues、Linear、Jira 等外部任务板接入
- 通用低代码 agent builder
- 知识库/RAG 平台
- agent 私有草稿区
- 原始 COT 暴露
- 自定义或扩展 ACP 协议本身

## 测试场景

- 启动一个 Codex work agent，并看到状态变为 `running`。
- 创建任务，并分配给选中的 agent。
- 启动一个 ACP-compatible agent，并把 session update 转换为 TendrilFlow room event。
- 在任务房间里 `@coordinator`，看到任务拆分、分配建议和决策记录。
- 在任务房间里 `@review-agent`，看到 review 输出进入 transcript。
- 任务失败后 `@debug-agent`，看到基于日志和事件的失败分析。
- 通过交接卡片把任务从 Agent A 转给 Agent B。
- 任务完成后生成最终报告。
- 确认 transcript 写入 `.tendrilflow/tasks/{task_id}/events.jsonl`。
- 确认用户能以群组形式看到任务讨论、交接、review 和完成过程。
