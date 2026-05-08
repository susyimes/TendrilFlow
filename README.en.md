# TendrilFlow

[中文 README](./README.md) | [Design](./docs/DESIGN.md)

TendrilFlow is a local-first collaboration workspace for coding agents.

The name comes from the image of tendrils reaching into different parts of a task: each agent can take a focused role, coordinate through visible discussion, hand work off cleanly, and leave an auditable work trail.

## Positioning

TendrilFlow is not a general AI agent application builder. It is designed to organize local CLI or SDK agents, such as Codex CLI, Kimi, Gemini, or custom agents, into a controllable, observable, and handoff-friendly task team.

The first implementation target is Codex CLI. Future providers should be added through adapters.

## Confirmed MVP Decisions

- UI: local web app.
- Transcript storage: files, with `.tendrilflow/tasks/{task_id}/events.jsonl` as the main room event stream.
- Agent communication: visible by default in the Agent Room.
- Coordinator role: included in the MVP.
- External task boards: not included in v1. Tasks come from the local Task Board or direct user dispatch.

## Core Modules

- Agent Launcher: starts and manages agent processes.
- Task Board: creates, assigns, and tracks tasks.
- Agent Room: shows group-style task collaboration.
- Orchestrator: routes messages, tracks state, stores transcript files, and coordinates handoff or review.
- Agent Adapter: isolates provider-specific behavior, starting with Codex CLI.

## Agent Roles

- Work Agent: executes the assigned task and produces the result.
- Observe Agent: watches task state and keeps a cross-room context view.
- Debug Agent: analyzes failures using logs, command output, and observable traces.
- Review Agent: reviews code changes, outputs, risks, and test coverage.
- Coordinator Agent: splits tasks, recommends assignment, organizes discussion, records decisions, and drives handoff.

## Communication And Handoff

Each task has an Agent Room. Important communication is visible to the user by default.

Supported event types:

- `user_message`
- `agent_message`
- `system_event`
- `tool_call_summary`
- `status_change`
- `decision_record`
- `handoff_note`
- `review_comment`
- `final_report`

When work moves from one agent to another, TendrilFlow should create a handoff card with the current goal, completed work, blockers, relevant files or logs, assumptions, recommended next step, and risks.

## Reasoning And Trace Policy

TendrilFlow should not expose raw chain-of-thought.

Instead, it should expose auditable traces:

- task understanding summaries
- plans
- decision records
- discussion summaries
- tool call summaries
- command output summaries
- file change summaries
- review comments
- handoff cards
- final reports

## Difference From Coze Studio

Coze Studio is closer to a general AI agent application development platform. It focuses on building agents, configuring resources, creating workflows, and publishing applications.

TendrilFlow focuses on local coding agents that already exist. It organizes tools like Codex CLI, Kimi, and Gemini into a workspace for real repository tasks, discussion, handoff, review, and recovery.

## MVP Scope

Included:

- local web app
- file-based transcript storage
- one Codex CLI adapter
- local Task Board
- manual task creation
- manual agent launch
- manual `@agent` routing
- Coordinator in MVP
- task room transcript
- structured handoff cards
- review and debug as configurable agent profiles

Not included in v1:

- GitHub Issues, Linear, Jira, or other external task board integrations
- general low-code agent builder
- RAG or knowledge base platform
- private agent scratchpads
- raw COT exposure
