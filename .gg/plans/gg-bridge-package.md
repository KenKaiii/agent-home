# Plan: GG Bridge Package — Connect any project to Agent Home

## Goal

Create `@kenkaiiii/gg-bridge` — an npm package installable in any project that connects it to the Agent Home iOS app via the relay server. Mirrors what `ggcoder serve` does for Telegram but for Agent Home.

**User flow:**

1. `npm i @kenkaiiii/ggcoder` (already a dependency in most projects)
2. Run `ggcoder bridge` (new mode added to ggcoder CLI)
3. Agent appears in the iOS app, ready to receive messages and execute code in the project

## Analysis

### Event ↔ Protocol Mapping

| AgentSession EventBus Event | Agent Home Protocol Message                           | Notes                                       |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `text_delta` → `{ text }`   | `CHAT_STREAM` → `{ messageId, agentId, token }`       | Buffer chars into tokens                    |
| `agent_done`                | `CHAT_STREAM_END` → `{ messageId, agentId, content }` | Full assembled content                      |
| `tool_call_start`           | `CHAT_STREAM`                                         | Send as formatted text: "🔧 tool_name args" |
| `tool_call_end`             | `CHAT_STREAM`                                         | Send as formatted text: "✓ tool_name 1.2s"  |
| `error`                     | `ERROR` or `CHAT_STREAM_END` with error text          |                                             |
| `compaction_end`            | `CHAT_STREAM`                                         | Send as info text                           |
| Incoming `CHAT_FORWARD`     | → `session.prompt(content)`                           | Core message handling                       |

### Architecture Decision

**Option A**: New package `@kenkaiiii/gg-bridge` in gg-coder monorepo

- Pro: Standalone, reusable
- Con: Duplicates AgentSession setup logic, tight coupling to ggcoder internals

**Option B**: New mode in `@kenkaiiii/ggcoder` — `ggcoder bridge` ← **CHOSEN**

- Pro: Reuses all existing infra (AgentSession, auth, config, tools, session management)
- Pro: No new package to maintain — same CLI the user already has
- Pro: Mirrors `ggcoder serve` pattern exactly
- Con: Requires ggcoder to be installed (but it already is in target projects)

### Key Design Points

- **One agent per project**: Running `ggcoder bridge` in a project dir registers that project as an agent on the relay. The agent name = directory name (e.g. "my-app").
- **Config**: Bridge token + relay URL stored in `~/.gg/bridge.json` (similar to `~/.gg/serve.json` for Telegram). First-time setup: `ggcoder bridge --setup` prompts for relay URL and generates a token.
- **Multiple projects**: Run `ggcoder bridge` in multiple terminal tabs = multiple agents visible in the iOS app.
- **Agent ID**: Deterministic from project path (hash of absolute path) so reconnects don't create duplicates.
- **Protocol dependency**: ggcoder needs `@agent-home/protocol` as a dependency, OR we inline the minimal WebSocket + message types needed (just the bridge-side messages). **Decision**: Inline the types — don't add cross-repo dependency. The protocol is small (~10 message types) and stable.

### Files to Create/Modify (in gg-coder repo)

**New files:**

- `packages/ggcoder/src/modes/bridge-mode.ts` — Main bridge mode (mirrors `serve-mode.ts`)
- `packages/ggcoder/src/core/bridge-client.ts` — WebSocket client for relay (mirrors `BridgeConnection` from agent-home/bridge)
- `packages/ggcoder/src/core/bridge-protocol.ts` — Inline protocol types (MessageType enum + message interfaces, no Zod needed on bridge side)
- `packages/ggcoder/src/core/bridge-config.ts` — Bridge config management (`~/.gg/bridge.json`)

**Modified files:**

- `packages/ggcoder/src/cli.ts` — Add `bridge` command
- `packages/ggcoder/src/modes/index.ts` — Export bridge mode

### Protocol Types to Inline (bridge-protocol.ts)

```typescript
// Only the types the bridge needs — no Zod dependency
export enum MessageType {
  CHAT_FORWARD = 'chat:forward',
  CHAT_STREAM = 'chat:stream',
  CHAT_STREAM_END = 'chat:stream_end',
  CHAT_RECEIVE = 'chat:receive',
  AGENT_REGISTER = 'agent:register',
  AGENT_UNREGISTER = 'agent:unregister',
  AGENT_HEARTBEAT = 'agent:heartbeat',
  ERROR = 'error',
}
```

### Bridge Config (~/.gg/bridge.json)

```json
{
  "relayUrl": "wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws",
  "token": "eyJ..."
}
```

### bridge-mode.ts — Core Flow

```
1. Load bridge config (~/.gg/bridge.json)
2. Create BridgeClient(relayUrl, token) — WebSocket connection
3. Generate agentId from cwd hash
4. On connect:
   - Send AGENT_REGISTER { id, name: basename(cwd), description: "GG Coder agent" }
   - Start heartbeat
5. On CHAT_FORWARD:
   - getOrCreateSession(cwd) → AgentSession
   - session.prompt(content)
   - Wire eventBus → CHAT_STREAM / CHAT_STREAM_END
6. On disconnect: auto-reconnect (same as existing bridge)
7. On SIGINT: AGENT_UNREGISTER + cleanup
```

### CLI Interface

```
ggcoder bridge [options]
  --setup          Configure relay URL and token
  --name <name>    Custom agent name (default: directory name)
  --model <model>  Model to use (default: from config)
  -p, --provider   Provider (default: anthropic)
```

First run without config → prompts for setup automatically.

### Existing Relay Deployment Info

- URL: `wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws`
- JWT Secret: saved in `agent-home/relay/.dev.vars`
- Token generation: `POST /auth/token` with `Authorization: Bearer <JWT_SECRET>`

## Risks

- **Cross-repo protocol sync**: If protocol messages change in agent-home, the inlined types in ggcoder must be updated manually. Mitigation: the protocol is simple and stable; document the types clearly.
- **WebSocket library**: ggcoder already uses Node.js — `ws` package is needed. It's not currently a dependency. Alternative: use native `WebSocket` (available in Node 22+).
- **Multiple sessions per project**: If the user sends another message while the agent is processing, we need to queue it (same as Telegram serve mode handles with `isProcessing`).

## Steps

1. Create `packages/ggcoder/src/core/bridge-protocol.ts` in the gg-coder repo (`/Users/kenkai/Documents/UnstableMind/gg-coder`) with inlined MessageType enum and TypeScript interfaces for the bridge-side protocol messages (CHAT_FORWARD, CHAT_STREAM, CHAT_STREAM_END, AGENT_REGISTER, AGENT_UNREGISTER, AGENT_HEARTBEAT, ERROR). No Zod — just plain types. Copy enum values from `agent-home/protocol/src/enums.ts`.
2. Create `packages/ggcoder/src/core/bridge-config.ts` with functions to load/save bridge config from `~/.gg/bridge.json` (relayUrl + token fields), plus an interactive setup function that prompts for relay URL and token using readline.
3. Create `packages/ggcoder/src/core/bridge-client.ts` — a WebSocket client class (`BridgeClient`) that connects to the relay, handles reconnection with exponential backoff, sends heartbeats every 30s, and provides `send()`, `on(type, handler)`, `connect()`, `disconnect()` methods. Use the native Node.js `WebSocket` (globalThis.WebSocket, available since Node 22). Model after `agent-home/bridge/src/connection.ts` but use the inlined protocol types.
4. Create `packages/ggcoder/src/modes/bridge-mode.ts` — the main bridge mode function `runBridgeMode(options)`. On connect: register the agent (id = hash of cwd, name = basename(cwd) or custom name). On CHAT_FORWARD: create/reuse an AgentSession, call `session.prompt(content)`, wire eventBus events to protocol messages (text_delta → CHAT_STREAM, tool_call_start/end → CHAT_STREAM as formatted text, agent_done → CHAT_STREAM_END with full assembled content). Handle isProcessing guard, cancellation, errors. Mirror the Telegram serve-mode pattern from `packages/ggcoder/src/modes/serve-mode.ts`.
5. Export `runBridgeMode` from `packages/ggcoder/src/modes/index.ts`.
6. Add the `bridge` subcommand to `packages/ggcoder/src/cli.ts` — parse `--setup`, `--name`, `--model`, `--provider` flags. If no config exists or `--setup` is passed, run interactive setup. Otherwise load config and call `runBridgeMode()`.
7. Build and verify: run `pnpm build` in the gg-coder repo to confirm TypeScript compilation succeeds with no errors.
8. Test end-to-end: run `ggcoder bridge` from the agent-home project directory, verify the agent appears in the iOS app simulator (already running from earlier), send a test message, and confirm streaming responses come back.
