# TendrilFlow 圆桌群聊机制

本文档记录 TendrilFlow 圆桌群聊的设计与实现。目标是让多个 agent 像人类群组成员一样围绕同一问题自由讨论：各自研究、发表判断、互相指出问题，最后在合适时由指定 agent 做一次总结。

## 设计原则

圆桌机制只提供说明、上下文、工具和技能，不把 agent 锁进固定流程里。

- TendrilFlow 负责维护群聊记录、参与者、主题、定时唤醒和可用技能。
- Agent 自己决定如何参与：发言、保持简短、先研究、质疑别人、补充证据、请求澄清或总结。
- 轮次、最终总结人、贡献数量都是建议性上下文，不是行为锁。
- 群聊可见记录是共享事实来源，agent 不应依赖隐藏侧聊来完成讨论。
- 路由、工具调用、Provider CLI 能力仍然可用，但是否使用由 agent 根据上下文判断。

## 用户体验目标

典型测试场景：

1. 用户创建 codex、gemini、kimi 等不同 provider 的 agent。
2. 用户发起圆桌主题，例如“下一个发布的大模型是什么”。
3. TendrilFlow 定时把最新群聊记录和主题交给下一个参与者。
4. 每个 agent 根据自己的模型能力和工具能力研究一会儿，把结论发到群里。
5. 后续唤醒会带上其他人的观点，agent 可以补证据、反驳、修正或追问。
6. 达到建议贡献数量后，指定的最终 agent 会收到“可以总结”的提示，但仍由它自行判断是否总结、如何总结。

这个模型更接近圆桌会议，而不是“群主逐条命令成员执行”。

## 实现概览

核心实现位于 `src/orchestrator.js`：

- `startRoundtable(workspaceId, groupId, input)` 创建一场圆桌会话。
- `ensureRoundtableSkill()` 给群组注入 `roundtable.participant` 技能说明。
- `scheduleRoundtableTick()` 和 `runRoundtableTick()` 按间隔唤醒参与者。
- `buildRoundtableContextMessage()` 为 agent 构造最新群聊上下文。
- `observeRoundtableAgentEvent()` 在 agent 发言后继续安排下一次唤醒。
- `completeRoundtable()` 在最终总结后标记圆桌完成。

HTTP API 位于 `src/server.js`：

- `GET /api/groups/:workspaceId/:groupId/roundtables`
- `POST /api/groups/:workspaceId/:groupId/roundtables`
- `GET /api/roundtables/:roundtableId`
- `POST /api/roundtables/:roundtableId/tick`
- `POST /api/roundtables/:roundtableId/stop`

测试覆盖位于 `tests/orchestrator.test.js`，用例验证圆桌 watcher 会注入 advisory context，并在建议贡献数达到后提示指定 agent 可以整理结论。

## Context 形态

圆桌唤醒消息包含：

- workspace、group、topic
- 建议贡献数和当前可见贡献数
- 最近群聊 transcript
- 当前参与者的自主说明
- 常见参与方式建议
- 如果是最终总结时机，则附带总结建议

这些内容都以 advisory 方式出现。TendrilFlow 不要求 agent 按固定格式回答，也不会隐藏或丢弃 agent 的自然回复。

## 与委派路由的关系

`GROUP_AGENT_ROUTING.md` 描述的是用户或授权 agent 明确让一个 agent 协调另一个 agent 的路由协议。

圆桌群聊不同：它默认是自由讨论。TendrilFlow 只定时把共享上下文递给成员，让它们像群聊成员一样自主发言。agent 仍然可以在认为有必要时使用路由能力，但圆桌机制本身不把讨论变成指挥链。

## 后续方向

- UI 增加“开始圆桌 / 停止圆桌 / 手动下一轮”入口。
- 支持不同节奏配置，例如快速头脑风暴、深度研究、最终复盘。
- 把 roundtable 状态持久化，服务重启后可以恢复。
- 在 transcript 折叠视图中把 watcher、route、tool 事件放到消息底部展开区。
