# A2A Spike

This spike exposes TendrilFlow as a minimal local Agent2Agent endpoint without replacing the internal ACP adapter or room event model.

## Endpoints

- `GET /.well-known/agent-card.json` returns a public Agent Card.
- `POST /a2a/jsonrpc` accepts JSON-RPC `SendMessage`, `SendStreamingMessage`, `GetTask`, and `CancelTask`.
- Legacy JSON-RPC aliases `message/send`, `message/stream`, `tasks/get`, and `tasks/cancel` are accepted for SDK compatibility checks.
- `POST /message:send` and `POST /a2a/message:send` create a TendrilFlow task room from a REST-style A2A message.
- `POST /message:stream` and `POST /a2a/message:stream` return a one-shot SSE stream containing the same task object.
- `GET /tasks/{id}` and `POST /tasks/{id}:cancel` query and cancel local task rooms.

## Mapping

Incoming A2A messages create a local TendrilFlow task in the selected workspace/group. The adapter chooses `metadata.owner_agent_id` when valid, otherwise the group Host Agent. The message is posted into the task room as actor `a2a_client`, so the normal TendrilFlow routing, claim, transcript, and role fallback logic still applies.

A2A task responses are built from the TendrilFlow task JSON and `events.jsonl` transcript:

- `todo` -> `submitted`
- `in_progress` or `review` -> `working`
- `blocked` -> `input-required`
- `done` -> `completed`
- `failed` -> `failed`
- canceled A2A tasks include `a2a_status: canceled` and report A2A state `canceled`

## Smoke

Run the repository test suite:

```bash
npm test
```

The server test covers Agent Card discovery, JSON-RPC send/get/cancel, and REST streaming smoke behavior.
