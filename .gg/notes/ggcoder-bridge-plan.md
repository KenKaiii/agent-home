# GG Coder → Agent Home Bridge Package Plan

## Goal

Create an npm package that any project can install to connect to the Agent Home iOS app via the relay. Like `ggcoder serve` does for Telegram, but for Agent Home.

## Current Architecture (gg-coder)

- **Location**: `/Users/kenkai/Documents/UnstableMind/gg-coder`
- **Monorepo**: pnpm workspaces with 3 packages:
  - `packages/gg-ai` (`@kenkaiiii/gg-ai`) — Unified LLM streaming API
  - `packages/gg-agent` (`@kenkaiiii/gg-agent`) — Agent loop with tool execution
  - `packages/ggcoder` (`@kenkaiiii/ggcoder`) — CLI coding agent
- **Serve mode**: `ggcoder serve` starts a Telegram bot that:
  - Creates `AgentSession` per chat (provider, model, cwd, tools)
  - Receives text/voice → runs `session.prompt(text)`
  - Streams events back: `text_delta`, `tool_call_start`, `tool_call_end`, `turn_end`, `agent_done`, `error`, `compaction_end`
  - Each chat can `/link` to a different project directory
  - Sessions persist via `~/.gg/sessions/`

## Key Classes

- `AgentSession` (from `packages/ggcoder/src/core/agent-session.ts`):
  - `new AgentSession({ provider, model, cwd, thinkingLevel, signal })`
  - `session.initialize()` — loads system prompt, tools, context
  - `session.prompt(text)` — sends prompt, runs agent loop
  - `session.eventBus` — emits streaming events
  - `session.dispose()` — cleanup
  - `session.getState()` — { model, messageCount, cwd }
  - `session.getMessages()` — conversation history
  - `session.switchModel(provider, model)`
  - `session.newSession()` — fresh session
  - `session.setSignal(signal)` — new AbortController signal

## What We Need

A new package (e.g. `@kenkaiiii/gg-bridge` or `@agent-home/bridge-sdk`) that:

1. Connects to the Agent Home relay via WebSocket
2. Registers as a bridge client
3. Wraps `AgentSession` — receives `CHAT_FORWARD`, runs the agent, streams back `CHAT_STREAM`/`CHAT_STREAM_END`
4. Can be installed in any project: `npm i @kenkaiiii/gg-bridge && npx gg-bridge serve`
5. Or used programmatically: `import { createBridge } from '@kenkaiiii/gg-bridge'`

## Agent Home Relay

- Deployed at: `https://agent-home-relay.buzzbeamaustralia.workers.dev`
- D1 database ID: `2d54a759-60ec-451a-b016-f1c75d0e35c1`
- JWT Secret in `relay/.dev.vars` (gitignored)
- Protocol package: `@agent-home/protocol` (local workspace package)

## Agent Home App Tokens

- App token: `eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRJZCI6IjViZGZmNWIzLTc2Y2MtNDNjOS1iOWI2LTYyMDhmYjVkMjE3ZSIsImNsaWVudFR5cGUiOiJhcHAiLCJleHAiOjE4MDYzMjMwMjksImlhdCI6MTc3NDc4NzAyOX0._aBYs9jbP6GBj-st4H2900Kn0csGjG2mtFuGHb2Tsdo`
- Bridge token: `eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRJZCI6IjgzMTNjYmZkLTNjNTItNDUzNi04ZTcwLTU3YzBhN2FmYjA2NiIsImNsaWVudFR5cGUiOiJicmlkZ2UiLCJleHAiOjE4MDYzMjMwMjksImlhdCI6MTc3NDc4NzAyOX0.5PNuaf1qacrnHdq4T84ByyHUmCKLAQojvMFZS5Oec7w`

## Protocol Messages (from relay DO)

Bridge receives:

- `CHAT_FORWARD` — `{ agentId, content, userId }` — user sent a message
  Bridge sends:
- `AGENT_REGISTER` — `{ agent: { id, name, description, icon } }`
- `AGENT_UNREGISTER` — `{ agentId }`
- `AGENT_HEARTBEAT` — `{ agentIds: string[] }`
- `CHAT_STREAM` — `{ messageId, agentId, token }` — streaming token
- `CHAT_STREAM_END` — `{ messageId, agentId, content }` — stream done
- `CHAT_RECEIVE` — `{ messageId, agentId, content }` — complete non-streamed response

## Existing Bridge Code (agent-home)

- Located at: `agent-home/bridge/`
- Simple bridge that manages stdio/http agents
- Config at `~/.agent-home/config.json`
- Connection code: `bridge/src/connection.ts` (WebSocket to relay)
- Agent manager: `bridge/src/agent-manager.ts`

## iOS Build

- Target device: UDID `00008140-000E30243488801C` (Indiana's iPhone)
- Command: `npx expo run:ios --device 00008140-000E30243488801C`
- Or simulator: `npx expo run:ios --device "iPhone 16 Pro"`
