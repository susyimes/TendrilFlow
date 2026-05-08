# TendrilFlow

[English README](./README.en.md)

TendrilFlow 是一个本地优先的多 Agent 任务协作系统。

名字来自“触手向不同方向伸展并处理任务”的意象：每个 agent 都可以承担一个清晰角色，围绕任务进行可见讨论，必要时完成结构化交接，并留下可审计的工作轨迹。

## 产品意图

TendrilFlow 的目标不是简单启动多个聊天窗口，而是把多个 CLI 或 SDK agent 组织成一个可控制、可观察、可交接的工作系统。

第一阶段以 Codex CLI 作为主要执行 agent。后续版本应通过 adapter 扩展到 Kimi、Gemini 或其他本地/云端 agent。

核心能力包括：

- 启动和配置 agents 的界面
- 任务入口和任务板
- 直接 `@agent` 或选中 agent 下发任务
- 以群组形式展示 agent 间沟通
- agent 间结构化讨论和交接
- 可定制角色，例如 work、observe、debug、review
- 可审计的工作轨迹，包括计划、决策、工具调用、状态变化、讨论、review 和交接记录

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

第一版重点是启动 Codex CLI session，并控制基础配置：

- agent 名称
- agent 角色
- 工作目录
- 模型或 provider 设置
- 环境变量
- 权限或执行模式
- 启动命令
- 运行状态

后续 provider 应通过 adapter 接入，避免上层产品逻辑绑定某一个 agent 实现。

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
- 交接卡片
- review comments
- 最终任务报告

用户可以用类似下面的方式召唤指定 agent：

```text
@review-agent 请 review 当前变更
@debug-agent 看一下为什么任务失败
@codex-worker 从交接卡片继续执行
```

### Orchestrator

负责任务和 agent 的协调。

Orchestrator 应负责：

- 创建和管理任务房间
- 路由消息到对应 agent
- 跟踪 agent 状态
- 收集 agent 进程输出
- 存储事件流
- 约束角色边界
- 判断何时需要交接或 review
- 将 provider 相关逻辑隔离到 adapter 内部

### Agent Adapter

负责 provider 相关接入。

第一版 adapter 目标是 Codex CLI。

统一 adapter 接口建议支持：

- 启动 agent
- 发送消息
- 流式读取输出
- 停止 agent
- 获取状态
- 附加任务上下文
- 发出结构化事件

Provider 特有行为应保留在 adapter 层。

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

上下文和协调角色。

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

可选的高层规划角色。

职责：

- 拆分大型任务
- 推荐 agent 分配
- 组织讨论
- 总结决策
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

这个机制用于避免 agent 切换时丢失上下文。

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

## MVP 流程

1. 用户创建任务。
2. 用户把任务分配给一个 Codex work agent。
3. TendrilFlow 创建任务房间。
4. Work agent 开始执行，并持续发出进度事件。
5. 用户可以在房间里观察 transcript。
6. 用户可以在需要时 `@debug-agent` 或 `@review-agent`。
7. Agents 在任务房间里讨论阻塞、方案或 review 结果。
8. 如果任务 owner 变化，当前 agent 创建交接卡片。
9. 接手 agent 确认交接并继续执行。
10. 任务完成后，房间生成最终报告，任务进入 `done`。

## 第一版建议

第一版应保持足够小：

- 本地 Web UI
- 本地数据存储
- 一个 Codex CLI adapter
- 手动创建任务
- 手动启动 agent
- 手动 `@agent` 路由
- 任务房间 transcript
- 结构化交接卡片
- review 和 debug 作为可配置 agent profiles

自动调度可以等控制界面和协作体验稳定后再做。

## 测试场景

- 启动一个 Codex work agent，并看到状态变为 `running`。
- 创建任务，并分配给选中的 agent。
- 在任务房间里 `@review-agent`，看到 review 输出进入 transcript。
- 任务失败后 `@debug-agent`，看到基于日志和事件的失败分析。
- 通过交接卡片把任务从 Agent A 转给 Agent B。
- 任务完成后生成最终报告。
- 确认用户能以群组形式看到任务讨论、交接、review 和完成过程。

## 开放问题

- 第一版 UI 应该是 Web app、桌面 app，还是 terminal UI？
- Orchestrator 的 transcript 应存 SQLite、文件，还是两者都存？
- 后续是否需要 agent 私有草稿区，还是所有 agent 沟通都默认可见？
- Coordinator role 是否进入 MVP，还是放到后续版本？
- v1 是否接入 GitHub Issues、Linear、Jira 等外部任务板？
