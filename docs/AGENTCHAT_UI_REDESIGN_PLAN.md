# TendrilFlow AgentChat UI Redesign Plan

## 1. Summary

TendrilFlow 后续 UI 建议从“任务工作台”转向“AgentChat 协作客户端”。

新的产品心智不再要求用户先理解 workspace、orchestrator、task graph、handoff rule，而是回到更自然的聊天模型：

```text
我在和一个 agent 聊。
我可以把它拉成一个群。
群里 agent 会分工做任务。
所有执行过程都能被看到、复盘、停止和接管。
```

参考方向采用微信式结构，而不是飞书式工作台结构。原因是微信结构天然以会话为中心，更适合从单聊过渡到群聊，也更贴近 AgentChat 产品化路径。

## 2. Product Positioning

TendrilFlow 应从“任务和 agent 配置面板”演进为“面向本地 coding agents 的会话式协作客户端”。

核心对象从页面层看应变成：

- Conversation：会话，是用户日常入口。
- Agent：会话成员，可以单聊，也可以进群。
- Group Chat：多个 agent 协作的群聊。
- Task：聊天中的可执行对象，以卡片形式出现。
- Trace：聊天中的可审计执行过程，默认折叠。
- Replay：任务完成或阶段结束后的复盘卡片。

Workspace 仍然存在，但不再作为主 UI 第一层。它更像账户/项目上下文，可以放在左上角切换器或设置里。

## 3. WeChat-Style Information Architecture

### 3.1 左侧：会话列表

左侧改成微信式会话列表。

展示内容：

- 搜索框
- 新建单聊
- 新建群聊
- 最近会话列表
- 置顶会话
- 会话头像
- 会话名称
- 最后一条消息摘要
- 未读数量
- 进行中/阻塞/待 review 状态
- 更新时间
- agent 正在执行的小状态点

会话类型：

- `dm`：用户和一个 agent 的单聊。
- `group`：用户和多个 agents 的群聊。
- `task`：由任务生成或绑定的任务会话。
- `system`：系统通知、错误、运行报告。

### 3.2 中间：主聊天区

中间区域完全变成聊天窗口。

顶部 header：

- 会话头像
- 会话名称
- 成员数量
- 当前状态：空闲、执行中、有阻塞、待 review
- 右侧入口：成员、任务、复盘、更多

消息区：

- 用户消息在右侧。
- agent 消息在左侧。
- system event 弱化显示。
- 执行过程默认折叠。
- 长工具输出折叠成“执行过程”。
- `task_graph`、`handoff`、`review`、`final_report`、`replay` 都变成消息卡片。

底部输入区：

- 普通聊天输入。
- `@agent` 成员联想。
- `/` 命令联想。
- 附件/文件按钮。
- 创建任务按钮。
- 发送按钮。
- 可切换“聊天模式 / 任务模式”。

### 3.3 右侧：会话详情栏

右侧默认隐藏，点击右上角打开。

详情栏包含：

- 成员列表
- Agent 启动、停止、删除
- 当前任务列表
- 当前任务状态
- Agent Console 入口
- 群组记忆
- 任务复盘
- 交接规则
- 高级编排设置

普通用户只需要聊天；高级用户才打开右侧详情。

## 4. Product Mapping

```text
微信会话列表        -> TendrilFlow Conversation List
单聊               -> User <-> Agent DM
群聊               -> User + 多 Agent Group Chat
群成员             -> Agents
聊天消息           -> room events / agent messages
文件、链接、卡片    -> task cards / report cards / replay cards / handoff cards
群公告、置顶        -> group memory / current objective / pinned task
聊天详情页          -> members / tasks / agent controls / memory / replay
```

## 5. Single Chat To Group Chat

AgentChat 产品化的关键是单聊到群聊的自然过渡。

### 5.1 单聊场景

```text
用户 -> host-agent

用户：帮我分析一下这个需求
host-agent：我建议拉一个执行 agent 和 review agent 进来

[创建群聊并拉入成员]
```

### 5.2 单聊升级群聊

单聊可以升级为群聊：

- 从 agent 单聊点击“拉人”。
- Host 建议添加成员。
- 用户确认后创建 group chat。
- 原单聊上下文带入新群。
- 后续任务在群里推进。

### 5.3 群聊拆出单聊

群聊也可以拆出单聊：

- 点击某个 agent。
- 查看它的私聊。
- 单独追问。
- 将结论转发回群。

## 6. Tasks As Chat Objects

任务不再是第一入口，而是聊天里的对象。

用户可以：

- 在聊天中直接说“创建一个任务”。
- 从某条消息生成任务。
- 从 Host 拆分结果生成多个任务。
- 点击任务卡片查看详情。
- 任务完成后在聊天中生成 final report 卡片。
- 打开 replay 卡片查看复盘。

任务列表仍然存在，但放在右侧详情栏或会话详情里。

## 7. Agent Status As Member Presence

每个 agent 在群聊里应该像成员一样存在。

成员状态：

- 在线
- 执行中
- 等待输入
- 阻塞
- 停止
- 报错
- 会话丢失

消息中的状态表达：

```text
qoo 正在执行...
qoo 运行了 3 条命令
qoo 需要 review
qoo 已完成任务
```

Agent Console 不作为主入口，而是从头像或右侧成员列表进入。

## 8. Data Model Direction

新增 `conversation` 作为第一产品对象。

```text
conversation
  id
  type: dm | group | task | system
  title
  avatar
  workspace_id
  group_id?
  task_id?
  member_agent_ids
  pinned
  unread_count
  last_message
  created_at
  updated_at
```

原有结构映射：

```text
Workspace -> 仍然保留，但弱化 UI
Group -> group conversation
Task Room -> task conversation / group 内任务线程
Agent -> conversation member
events.jsonl -> conversation messages
agent_logs -> Agent Console
```

## 9. Phased Implementation Plan

### Phase 1: Conversation List Shell

目标：先建立微信式外壳，让用户进入产品时看到的是会话，而不是配置台。

- 新增 conversation 数据模型。
- 左侧改成会话列表。
- group/task/agent 映射为 conversation。
- 点击会话切换中间聊天区。
- Workspace 切换入口弱化到顶部或设置。

### Phase 2: Chat Area Redesign

目标：把中间区域重做成真正聊天体验。

- 重新设计消息气泡。
- 用户消息右侧，agent 消息左侧。
- system event 弱化。
- 执行过程默认折叠。
- task/report/replay/handoff 统一卡片化。
- 输入框改成聊天输入体验。

### Phase 3: Direct Message

目标：支持用户和单个 agent 单聊。

- 支持 `user <-> agent` DM。
- 点击 agent 创建或进入单聊。
- 单聊里可以发任务给 agent。
- 单聊上下文可以转入群聊。

### Phase 4: Group Detail Panel

目标：把复杂操作收进右侧详情栏。

- 新增右侧可展开详情栏。
- 成员管理。
- 当前任务列表。
- Agent 启动、停止、删除。
- Agent Console 入口。
- Replay、Memory、Handoff Rules 入口。

### Phase 5: AgentChat Productization

目标：形成真正的 AgentChat 协作产品闭环。

- Host 建议“拉人组群”。
- 单聊升级群聊。
- 群聊内任务卡片。
- 群聊内 agent 协作状态。
- 会话未读、进行中、阻塞提醒。
- 从成功任务沉淀 replay、memory 和 skill。

## 10. Design Principles

- 会话优先：用户进入产品先看到会话，而不是配置项。
- 聊天即编排：用户通过自然对话驱动 agent 分工和任务推进。
- 任务卡片化：任务、交接、复盘、报告都作为聊天对象出现。
- 高级能力后置：workspace、handoff rules、agent launcher、console 都放入详情或高级入口。
- 可观察但不打扰：执行过程默认折叠，需要时展开。
- 单聊群聊一体：单聊可以升级群聊，群聊可以拆出单聊。
- 用户保留控制权：停止、广播、接管、删除等控制动作必须清晰可见。

## 11. Non-Goals For The First Redesign

第一轮页面改造不做：

- 不重写 provider adapter。
- 不改变 ACP 通信协议。
- 不做完整移动端适配。
- 不做复杂主题系统。
- 不做跨 workspace 全局搜索。
- 不做自动合并 agent worktree。
- 不把 workspace 从数据模型中删除。

## 12. Acceptance Criteria

- 用户打开页面后首先看到会话列表。
- 用户可以进入一个 group conversation，并看到聊天式 Agent Room。
- 用户可以点击 agent 进入单聊。
- 用户可以从单聊升级为群聊。
- 任务以卡片形式出现在聊天中。
- 执行过程默认折叠，可展开查看。
- 右侧详情栏可以查看成员、任务、Agent Console、Replay 和 Memory。
- 原有任务执行、agent 启停、review、handoff、replay 能力不丢失。
