# TendrilFlow

TendrilFlow is a local-first multi-agent task collaboration system.

The name comes from the image of tendrils reaching into different parts of a task: each agent can take a focused role, coordinate through visible discussion, hand work off cleanly, and leave an auditable trail of what happened.

## Product Intent

TendrilFlow is designed to turn multiple CLI or SDK agents into a controllable work system instead of a loose collection of chat sessions.

The first implementation target is Codex CLI. Later versions should support other agent providers such as Kimi, Gemini, or custom local agents through adapters.

The core product should provide:

- a UI for launching and configuring agents
- a task entry point and task board for assigning work
- direct `@agent` or selected-agent task dispatch
- visible group-style communication between agents
- structured handoff between agents
- configurable agent roles such as work, debug, observe, and review
- an auditable work trace that shows plans, decisions, tool calls, status changes, discussions, reviews, and handoffs

## Core Experience

TendrilFlow should feel like an agent operations room.

The user can create a task, assign it to one or more agents, and watch the task progress in a group room. Agents can discuss a plan, ask for help, hand work over, request review, and produce a final report.

The user remains in control:

- the user can start, stop, and configure agents
- the user can assign or reassign tasks
- the user can `@` a specific agent into a task room
- the user can inspect the communication and execution trail
- the user can decide whether a result is accepted, needs review, or should be retried

## Main Modules

### Agent Launcher

Responsible for starting and managing agent processes.

For the first version, this means launching Codex CLI sessions with controlled configuration:

- agent name
- role
- working directory
- model or provider settings
- environment variables
- permissions or execution mode
- startup command
- runtime status

Future providers should be integrated through adapters instead of changing the rest of the system.

### Task Board

Responsible for task intake and progress tracking.

Tasks should support simple states:

- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`
- `failed`

Each task should have:

- title
- description
- current owner agent
- participating agents
- status
- related files or links
- room transcript
- handoff records
- final report

### Agent Room

Each task gets a group-style room.

The room is where the user sees the live collaboration process:

- user messages
- agent messages
- system events
- tool call summaries
- task status changes
- discussion threads
- handoff cards
- review comments
- final task report

The user should be able to mention an agent with syntax like:

```text
@review-agent please review the current changes
@debug-agent inspect why the task failed
@codex-worker continue from the handoff card
```

### Orchestrator

Responsible for coordination.

The orchestrator should:

- create and manage task rooms
- route messages to the right agents
- track agent status
- collect process output
- store events
- enforce role boundaries
- decide when handoff or review is required
- keep provider-specific logic behind adapters

### Agent Adapter

Responsible for provider-specific integration.

The first adapter should target Codex CLI.

The common adapter interface should support:

- start agent
- send message
- stream output
- stop agent
- get status
- attach task context
- emit structured events

Provider-specific behavior should stay inside the adapter.

## Agent Roles

### Work Agent

The main execution role.

Responsibilities:

- understand the assigned task
- make and update a plan
- execute the work
- run relevant checks
- report progress
- produce the final result

### Observe Agent

The context and coordination role.

Responsibilities:

- observe task state
- summarize active work
- detect blockers
- suggest when help is needed
- prepare context for other agents
- keep a global view across tasks and rooms

### Debug Agent

The failure analysis role.

Responsibilities:

- inspect logs, command output, and task events
- identify likely failure causes
- suggest fixes
- help another agent recover from a blocked state

The debug agent should inspect observable traces, not private raw reasoning.

### Review Agent

The review role.

Responsibilities:

- review code changes
- inspect task outputs
- identify risks
- check whether tests are sufficient
- leave actionable review comments
- recommend accept, revise, or reject

### Coordinator Agent

An optional higher-level planning role.

Responsibilities:

- split larger tasks
- recommend agent assignment
- organize discussions
- summarize decisions
- resolve ownership conflicts

## Communication Mechanism

Agent communication should be visible by default.

The core model is a task room, similar to a group chat, where all important work communication is shown to the user.

Supported message types:

- `user_message`
- `agent_message`
- `system_event`
- `tool_call_summary`
- `status_change`
- `decision_record`
- `handoff_note`
- `review_comment`
- `final_report`

This lets the user understand not only the final answer, but also how the group of agents moved the task forward.

## Discussion Mechanism

Agents should be able to discuss plans and risks before or during execution.

A discussion should be used when:

- the task has multiple plausible approaches
- an agent is blocked
- a handoff is about to happen
- a review agent disagrees with the implementation
- a coordinator needs to resolve task ownership

Discussion output should end with a short decision record:

- chosen approach
- rejected alternatives
- reason for the decision
- owner of the next action

## Handoff Mechanism

Handoff is a first-class workflow.

When one agent transfers work to another, the system should create a handoff card.

A handoff card should include:

- current task goal
- what has been completed
- current state
- known blockers
- relevant files, commands, links, or logs
- assumptions already made
- next recommended action
- risks or cautions

The receiving agent should acknowledge the handoff before continuing.

This prevents task loss when work moves between agents.

## Reasoning And Trace Policy

The product should not expose raw chain-of-thought.

Instead, TendrilFlow should expose auditable reasoning traces:

- task understanding summary
- plan
- decision records
- discussion summaries
- tool call summaries
- command output summaries
- file change summaries
- review comments
- handoff cards
- final report

This gives the user visibility and control without depending on private raw reasoning.

## MVP Flow

1. User creates a task.
2. User assigns the task to a Codex work agent.
3. TendrilFlow creates a task room.
4. The work agent starts execution and emits progress events.
5. The user can watch the room transcript.
6. The user can mention debug or review agents when needed.
7. Agents discuss blockers, plans, or review findings in the task room.
8. If ownership changes, the current agent creates a handoff card.
9. The receiving agent acknowledges the handoff and continues.
10. When complete, the room receives a final report and the task moves to `done`.

## Suggested First Version

The first version should stay intentionally small:

- local web UI
- local data store
- one Codex CLI adapter
- manual task creation
- manual agent launch
- manual `@agent` routing
- task room transcript
- structured handoff cards
- review and debug roles as configurable agent profiles

Automation can come later after the control surface feels right.

## Test Scenarios

- Start a Codex work agent and see it become `running`.
- Create a task and assign it to a selected agent.
- Mention `@review-agent` in a task room and see review output appear in the transcript.
- Mention `@debug-agent` after a failure and see a failure analysis based on logs and events.
- Transfer a task from one agent to another using a handoff card.
- Complete a task and generate a final report.
- Confirm the user can see the group-style discussion for the task.

## Open Questions

- Should the first UI be a web app, desktop app, or terminal UI?
- Should the orchestrator store transcripts in SQLite, files, or both?
- Should agent rooms support private drafts later, or should all agent communication remain visible?
- Should the coordinator role exist in the MVP or remain a later addition?
- Should external task boards such as GitHub Issues, Linear, or Jira be included in v1?
