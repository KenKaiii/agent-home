# Agent Home — Full Build Plan

## Overview

A Telegram-style mobile app for chatting with AI agents running on your laptop, from anywhere. Three layers: **Expo App** (phone), **Relay Server** (cloud), **Agent Bridge** (laptop daemon).

```
Phone (Expo)                    Cloud (VPS)                     Laptop
─────────────                   ──────────────                  ──────
expo-router                     ws (server)                     ws (client)
expo-sqlite + drizzle           hono                            execa
react-native-markdown-display   better-sqlite3                  zod
zustand                         zod
expo-notifications              jsonwebtoken
Built-in WebSocket API ──WSS──► Relay Server ◄──WSS── Agent Bridge
                                                       ├─ Claude Code
                                                       ├─ Custom Agent
                                                       └─ ...
```

---

## Current State

- Fresh Expo project (SDK 55, React 19, RN 0.83)
- Single `App.tsx` + `index.ts` entry point (no expo-router yet)
- `tsconfig.json` has `@/*` path alias
- `app.json` has `newArchEnabled: true`
- No `src/` or `app/` directory yet

---

## Repository Structure

Everything lives in this monorepo. The relay and bridge are separate packages within it.

```
agent-home/
├── src/
│   ├── app/                    # Expo Router pages
│   │   ├── _layout.tsx         # Root layout (providers, fonts, theme)
│   │   ├── index.tsx           # Redirect to /agents
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx     # Tab navigator
│   │   │   ├── agents.tsx      # Agent list (main screen)
│   │   │   └── settings.tsx    # Settings screen
│   │   └── chat/
│   │       └── [agentId].tsx   # Chat screen (dynamic route)
│   ├── components/
│   │   ├── AgentCard.tsx       # Agent list item
│   │   ├── ChatBubble.tsx      # Message bubble with markdown
│   │   ├── ChatInput.tsx       # Text input + send button
│   │   ├── ConnectionStatus.tsx # Online/offline indicator
│   │   └── StreamingText.tsx   # Token-by-token rendering
│   ├── hooks/
│   │   ├── useWebSocket.ts     # WebSocket connection management
│   │   ├── useAgents.ts        # Agent list state
│   │   ├── useChat.ts          # Chat messages for an agent
│   │   └── useNotifications.ts # Push notification setup
│   ├── stores/
│   │   ├── connection.ts       # Zustand: WS connection state
│   │   ├── agents.ts           # Zustand: agent registry
│   │   └── messages.ts         # Zustand: message cache
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema (agents, messages)
│   │   ├── migrations/         # SQL migrations
│   │   └── index.ts            # DB init + provider
│   ├── lib/
│   │   ├── websocket.ts        # WS client singleton
│   │   ├── config.ts           # Relay URL, auth config
│   │   └── constants.ts        # Colors, sizes, etc.
│   └── types/
│       └── index.ts            # Shared app types
├── protocol/                   # Shared protocol package
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Re-exports
│   │   ├── messages.ts         # Zod schemas for all WS messages
│   │   ├── agent.ts            # Agent registration types
│   │   └── enums.ts            # MessageType, AgentStatus enums
├── relay/                      # Relay server
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Entry point
│   │   ├── server.ts           # Hono HTTP + WS upgrade
│   │   ├── ws/
│   │   │   ├── handler.ts      # WS connection handler
│   │   │   ├── router.ts       # Route messages between clients
│   │   │   └── auth.ts         # Token verification on connect
│   │   ├── db/
│   │   │   ├── schema.ts       # Drizzle schema (messages, agents, tokens)
│   │   │   ├── migrations/
│   │   │   └── index.ts        # better-sqlite3 init
│   │   └── lib/
│   │       ├── token.ts        # JWT create/verify
│   │       └── push.ts         # Expo push notification sender
├── bridge/                     # Agent bridge (laptop daemon)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Entry: connect to relay, register agents
│   │   ├── connection.ts       # WS client with auto-reconnect
│   │   ├── agent-manager.ts    # Manage multiple agent processes
│   │   ├── agents/
│   │   │   ├── base.ts         # Abstract agent interface
│   │   │   ├── stdio.ts        # Agent that communicates via stdin/stdout
│   │   │   └── http.ts         # Agent that communicates via HTTP API
│   │   └── config.ts           # Bridge config (which agents, relay URL)
├── assets/
├── app.json
├── package.json                # Root: Expo app + workspace config
├── tsconfig.json
└── index.ts                    # Expo entry point (will change for expo-router)
```

---

## Implementation Phases

### Phase 1: Foundation — Protocol + Project Structure

**Goal**: Shared types, monorepo setup, project scaffolding.

#### Step 1.1: Convert to monorepo workspace structure
- Add npm workspaces to root `package.json`:
  ```json
  "workspaces": ["protocol", "relay", "bridge"]
  ```
- The root remains the Expo app (so Expo CLI still works from root)

#### Step 1.2: Create `protocol/` package
- `protocol/package.json` — name: `@agent-home/protocol`, no build step needed (TS source consumed directly)
- `protocol/tsconfig.json`
- `protocol/src/enums.ts`:
  ```typescript
  export enum MessageType {
    // Client → Relay
    CHAT_SEND = 'chat.send',
    AGENT_LIST = 'agent.list',
    HISTORY_REQUEST = 'history.request',
    
    // Relay → Client
    CHAT_RECEIVE = 'chat.receive',
    CHAT_STREAM = 'chat.stream',       // streaming token
    CHAT_STREAM_END = 'chat.stream.end',
    AGENT_LIST_RESPONSE = 'agent.list.response',
    AGENT_STATUS = 'agent.status',
    HISTORY_RESPONSE = 'history.response',
    ERROR = 'error',
    
    // Bridge → Relay
    AGENT_REGISTER = 'agent.register',
    AGENT_UNREGISTER = 'agent.unregister',
    AGENT_HEARTBEAT = 'agent.heartbeat',
    
    // Relay → Bridge
    CHAT_FORWARD = 'chat.forward',     // forward user message to agent
  }

  export enum AgentStatus {
    ONLINE = 'online',
    OFFLINE = 'offline',
    BUSY = 'busy',
  }

  export enum ClientType {
    APP = 'app',       // phone
    BRIDGE = 'bridge', // laptop
  }
  ```

- `protocol/src/messages.ts` — Zod schemas:
  ```typescript
  // Base envelope
  const BaseMessage = z.object({
    id: z.string(),
    type: z.nativeEnum(MessageType),
    timestamp: z.number(),
  });

  // Chat message from user
  const ChatSend = BaseMessage.extend({
    type: z.literal(MessageType.CHAT_SEND),
    agentId: z.string(),
    content: z.string(),
  });

  // Streaming token from agent
  const ChatStream = BaseMessage.extend({
    type: z.literal(MessageType.CHAT_STREAM),
    agentId: z.string(),
    token: z.string(),        // partial text chunk
    messageId: z.string(),    // groups tokens into one message
  });

  // Agent registration
  const AgentRegister = BaseMessage.extend({
    type: z.literal(MessageType.AGENT_REGISTER),
    agent: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),    // emoji or URL
      capabilities: z.array(z.string()).optional(),
    }),
  });

  // ... etc for all message types
  // Union discriminated type for all messages
  export const RelayMessage = z.discriminatedUnion('type', [
    ChatSend, ChatStream, ChatStreamEnd, ChatReceive,
    AgentRegister, AgentUnregister, AgentStatus,
    AgentListRequest, AgentListResponse,
    HistoryRequest, HistoryResponse,
    ErrorMessage,
  ]);
  export type RelayMessage = z.infer<typeof RelayMessage>;
  ```

- `protocol/src/agent.ts` — Agent type definitions
- `protocol/src/index.ts` — Re-export everything

#### Step 1.3: Set up Expo Router in the app
- Install: `expo-router`, `expo-linking`, `expo-constants`, `expo-status-bar`, `react-native-safe-area-context`, `react-native-screens`
- Update `app.json`:
  ```json
  "scheme": "agent-home",
  "plugins": ["expo-router"]
  ```
- Update `package.json` main to `"expo-router/entry"`
- Remove old `index.ts` and `App.tsx`
- Create `src/app/_layout.tsx` (root layout with providers)
- Create `src/app/index.tsx` (redirect to agents list)
- Create stub pages for tabs and chat

---

### Phase 2: Relay Server

**Goal**: Working WebSocket relay that can authenticate, route messages, and persist history.

#### Step 2.1: Scaffold relay package
- `relay/package.json` with deps: `ws`, `hono`, `@hono/node-server`, `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `jsonwebtoken`, `nanoid`, `zod`, `dotenv`
- `relay/tsconfig.json`
- `relay/.env.example`: `PORT`, `JWT_SECRET`, `DATABASE_PATH`

#### Step 2.2: HTTP server + WebSocket upgrade
- `relay/src/server.ts`:
  - Hono app with routes:
    - `GET /health` — health check
    - `POST /auth/token` — generate a device token (with a shared secret)
    - `GET /agents` — list registered agents (REST fallback)
  - Upgrade HTTP → WS on `/ws` path
  - Authenticate via `?token=` query param on WS connect

#### Step 2.3: WebSocket handler + routing
- `relay/src/ws/handler.ts`:
  - On connect: identify client type (app vs bridge) from token claims
  - Parse every message through `RelayMessage` zod schema
  - Route based on message type
- `relay/src/ws/router.ts`:
  - `handleChatSend`: look up which bridge owns `agentId`, forward as `CHAT_FORWARD`
  - `handleAgentRegister`: store agent in memory + DB, broadcast `AGENT_STATUS` to all app clients
  - `handleAgentUnregister`: remove agent, broadcast offline status
  - `handleHeartbeat`: update last-seen timestamp
  - Message buffering: if target client is disconnected, queue messages (in-memory with DB fallback)
- `relay/src/ws/auth.ts`:
  - Verify JWT on WebSocket upgrade
  - Extract `clientType`, `clientId` from token claims

#### Step 2.4: Database (message persistence)
- `relay/src/db/schema.ts` — Drizzle schema:
  - `agents` table: id, name, description, icon, status, bridgeId, lastSeen, createdAt
  - `messages` table: id, agentId, role (user/assistant), content, createdAt
  - `devices` table: id, pushToken, clientType, createdAt
- `relay/src/db/index.ts` — Init better-sqlite3 + drizzle
- Run migrations on startup
- Store last N messages per agent (configurable, default 100)

#### Step 2.5: Push notification support
- `relay/src/lib/push.ts`:
  - When a message arrives from an agent and the app client is disconnected:
    - Look up push token for that device
    - Send via Expo Push API (`https://exp.host/--/api/v2/push/send`)

#### Step 2.6: Entry point
- `relay/src/index.ts`: Load env, init DB, start Hono server, log startup info
- Add npm scripts: `dev` (tsx watch), `build` (tsc), `start`

---

### Phase 3: Expo App — Core UI

**Goal**: Telegram-style chat UI with agent list, chat screen, local storage.

#### Step 3.1: Install app dependencies
```
npx expo install expo-sqlite zustand
npm install drizzle-orm react-native-markdown-display date-fns @react-native-community/netinfo expo-secure-store
```

#### Step 3.2: Theme + Layout
- `src/lib/constants.ts` — Dark theme colors (terminal aesthetic):
  ```typescript
  export const colors = {
    bg: '#0d1117',
    surface: '#161b22',
    surfaceHover: '#1c2333',
    border: '#30363d',
    text: '#e6edf3',
    textSecondary: '#8b949e',
    accent: '#58a6ff',
    green: '#3fb950',    // online
    red: '#f85149',      // offline
    yellow: '#d29922',   // busy
  };
  ```
- `src/app/_layout.tsx`:
  - SQLiteProvider wrapping the app
  - SafeAreaProvider
  - StatusBar config (light content, dark bg)
  - Global error boundary

#### Step 3.3: Local database
- `src/db/schema.ts` — Drizzle tables:
  - `agents`: id, name, description, icon, status, lastMessageAt
  - `messages`: id, agentId, role, content, streaming (bool), createdAt
  - `settings`: key-value store
- `src/db/index.ts` — SQLiteProvider setup with migrations
- Use `useLiveQuery` from expo-sqlite for reactive queries

#### Step 3.4: Zustand stores
- `src/stores/connection.ts`:
  ```typescript
  interface ConnectionStore {
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    lastError: string | null;
    connect: () => void;
    disconnect: () => void;
  }
  ```
- `src/stores/agents.ts`:
  ```typescript
  interface AgentsStore {
    agents: Map<string, Agent>;
    updateAgent: (agent: Agent) => void;
    removeAgent: (id: string) => void;
  }
  ```
- `src/stores/messages.ts`:
  ```typescript
  interface MessagesStore {
    // In-flight streaming messages (not yet in DB)
    streamingMessages: Map<string, { agentId: string; tokens: string[] }>;
    appendToken: (messageId: string, agentId: string, token: string) => void;
    finalizeMessage: (messageId: string) => void;
  }
  ```

#### Step 3.5: Agent List screen (`src/app/(tabs)/agents.tsx`)
- FlatList of agents sorted by lastMessageAt
- Each item shows: icon/emoji, name, status dot (green/yellow/red), last message preview, timestamp
- Pull-to-refresh to re-fetch agent list
- Empty state: "No agents connected. Start the bridge on your laptop."
- Tap → navigate to `/chat/[agentId]`

#### Step 3.6: Chat screen (`src/app/chat/[agentId].tsx`)
- Header: agent name + status indicator
- FlatList (inverted) of messages
- Each message: `ChatBubble` component
  - User messages: right-aligned, accent color
  - Agent messages: left-aligned, rendered with `react-native-markdown-display` (code blocks, bold, lists, etc.)
  - Streaming messages: show tokens as they arrive with a blinking cursor
- Input bar at bottom: TextInput + Send button
  - Keyboard avoiding view
  - Multi-line support
- On mount: load history from local DB, request recent from relay if gaps exist

#### Step 3.7: Components
- `ChatBubble.tsx`: Markdown rendering for agent, plain text for user, timestamp, copy button
- `ChatInput.tsx`: TextInput with send button, disabled state when disconnected
- `AgentCard.tsx`: Agent list item with status dot
- `ConnectionStatus.tsx`: Banner at top when disconnected ("Reconnecting...")
- `StreamingText.tsx`: Renders accumulated tokens with cursor animation

#### Step 3.8: Settings screen (`src/app/(tabs)/settings.tsx`)
- Relay URL configuration
- Auth token input/paste
- Connection status display
- Push notification toggle
- About / version info

---

### Phase 4: WebSocket Integration

**Goal**: Connect the Expo app to the relay server in real-time.

#### Step 4.1: WebSocket client singleton (`src/lib/websocket.ts`)
- Class `RelayClient`:
  - `connect(url, token)` — open WS connection with auth
  - `disconnect()`
  - `send(message: RelayMessage)` — serialize + send
  - `on(type, handler)` — typed event handlers
  - Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
  - Heartbeat every 30s to keep connection alive
  - Queue messages while disconnected, flush on reconnect

#### Step 4.2: useWebSocket hook (`src/hooks/useWebSocket.ts`)
- Initialize RelayClient on mount
- Wire incoming messages to zustand stores:
  - `AGENT_STATUS` → update agents store
  - `CHAT_STREAM` → append token to streaming messages
  - `CHAT_STREAM_END` → finalize message, save to DB
  - `CHAT_RECEIVE` → save complete message to DB
  - `AGENT_LIST_RESPONSE` → update agents store
  - `ERROR` → show toast/alert
- Listen to NetInfo for connectivity changes, reconnect when back online
- Clean up on unmount

#### Step 4.3: useChat hook (`src/hooks/useChat.ts`)
- Takes `agentId`
- Returns `{ messages, sendMessage, isStreaming }`
- Loads messages from local DB on mount
- `sendMessage(text)`:
  1. Save user message to local DB immediately (optimistic)
  2. Send `CHAT_SEND` via WebSocket
  3. If WS disconnected, queue for later
- Merges DB messages with in-flight streaming messages

#### Step 4.4: useAgents hook (`src/hooks/useAgents.ts`)
- Returns `{ agents, refresh }`
- On mount: load from local DB (cached), request fresh list via WS
- Updates reactively from zustand store when `AGENT_STATUS` arrives

---

### Phase 5: Agent Bridge

**Goal**: Laptop daemon that connects agents to the relay.

#### Step 5.1: Scaffold bridge package
- `bridge/package.json` with deps: `ws`, `execa`, `tree-kill`, `zod`, `nanoid`, `dotenv`, `chalk`
- `bridge/tsconfig.json`
- `bridge/.env.example`: `RELAY_URL`, `BRIDGE_TOKEN`

#### Step 5.2: Connection manager (`bridge/src/connection.ts`)
- Connect to relay via WS with auth token
- Auto-reconnect with backoff
- On connect: register all configured agents
- Heartbeat every 30s

#### Step 5.3: Agent interface (`bridge/src/agents/base.ts`)
```typescript
export interface AgentAdapter {
  id: string;
  name: string;
  description?: string;
  icon?: string;

  // Send a user message to the agent
  send(message: string): Promise<void>;

  // Called when agent produces output (streaming)
  onToken?: (callback: (token: string) => void) => void;

  // Called when agent produces complete response
  onResponse?: (callback: (response: string) => void) => void;

  // Start/stop the agent
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

#### Step 5.4: stdio adapter (`bridge/src/agents/stdio.ts`)
- For agents that communicate via stdin/stdout (like Claude Code, custom scripts)
- Spawn process with `execa`
- Write user messages to stdin
- Read stdout line-by-line or character-by-character for streaming
- Handle process exit/restart

#### Step 5.5: HTTP adapter (`bridge/src/agents/http.ts`)
- For agents that expose an HTTP API
- POST user message to agent's endpoint
- Support SSE streaming responses
- Health check polling

#### Step 5.6: Agent manager (`bridge/src/agent-manager.ts`)
- Load agent configs from config file
- Start/stop/restart agents
- Route incoming messages from relay to correct agent
- Forward agent responses back to relay as `CHAT_STREAM` / `CHAT_RECEIVE`

#### Step 5.7: Config file (`bridge/src/config.ts`)
- Load from `~/.agent-home/config.json` or env vars:
  ```json
  {
    "relayUrl": "wss://your-relay.example.com/ws",
    "token": "...",
    "agents": [
      {
        "id": "claude-code",
        "name": "Claude Code",
        "type": "stdio",
        "command": "claude",
        "args": ["--chat"],
        "icon": "🤖"
      },
      {
        "id": "custom-agent",
        "name": "My Custom Agent",
        "type": "http",
        "url": "http://localhost:8080",
        "icon": "⚡"
      }
    ]
  }
  ```

#### Step 5.8: Entry point + CLI
- `bridge/src/index.ts`:
  - Load config
  - Connect to relay
  - Start agent manager
  - Handle graceful shutdown (SIGINT/SIGTERM)
- npm scripts: `dev`, `build`, `start`

---

### Phase 6: Push Notifications

**Goal**: Get notified when an agent responds while the app is backgrounded.

#### Step 6.1: Install notification deps
```
npx expo install expo-notifications expo-device expo-constants
```

#### Step 6.2: Notification setup hook (`src/hooks/useNotifications.ts`)
- Request permissions on first launch
- Get Expo push token
- Send token to relay via REST endpoint (`POST /devices/register`)
- Handle foreground notifications (show in-app toast, not system notification)
- Handle notification tap → navigate to correct chat screen

#### Step 6.3: Relay push integration
- When relay receives agent response and app client is disconnected:
  - Look up device push tokens
  - Send via Expo Push API
  - Include `agentId` in notification data for deep linking

#### Step 6.4: App config
- Update `app.json` with notification config (icon, colors, channels)

---

### Phase 7: Polish + Reliability

#### Step 7.1: Reconnection handling
- Show `ConnectionStatus` banner when disconnected
- Auto-reconnect with exponential backoff
- On reconnect: re-sync agent list, request missed messages

#### Step 7.2: Message delivery guarantees
- Optimistic sends with local persistence
- Retry queue for failed sends
- Message deduplication (by ID) on receive

#### Step 7.3: Streaming UX
- Token-by-token rendering with cursor animation
- "Agent is typing..." indicator
- Smooth scroll to bottom as tokens arrive

#### Step 7.4: Error states
- Agent offline → show disabled input with message
- Relay unreachable → show reconnecting banner
- Message send failure → show retry button on message

---

## Implementation Order (Tasks)

These are in strict dependency order:

1. **Protocol package** — Zod schemas, enums, types (everything depends on this)
2. **Monorepo setup** — npm workspaces, shared tsconfig
3. **Expo Router migration** — Convert from App.tsx to file-based routing
4. **Relay server scaffold** — HTTP server, WS handler, auth
5. **Relay WS routing** — Message parsing, client tracking, message forwarding
6. **Relay DB + persistence** — Store messages, agents, devices
7. **App theme + layout** — Dark theme, tab navigation, basic screens
8. **App local DB** — expo-sqlite + drizzle schema, migrations
9. **App WebSocket client** — Connection singleton, reconnection, stores
10. **App agent list screen** — FlatList, agent cards, status indicators
11. **App chat screen** — Messages, markdown rendering, input
12. **App streaming support** — Token accumulation, cursor animation
13. **Bridge scaffold** — WS client, config loading, auto-reconnect
14. **Bridge agent adapters** — stdio + HTTP adapters
15. **Bridge agent manager** — Multi-agent orchestration
16. **Push notifications** — App + relay integration
17. **Settings screen** — Config UI, connection management
18. **Polish** — Error handling, reconnection UX, message retry

---

## Key Design Decisions

1. **Monorepo, not multi-repo**: Shared protocol package makes type safety trivial. Expo doesn't mind colocated packages.

2. **Raw `ws` over Socket.IO**: We control both ends. No browser fallback needed. Less overhead, more control over streaming protocol.

3. **SQLite on both app + relay**: Local-first on phone (works offline, instant loads). Lightweight persistence on relay (no Postgres needed for single-user).

4. **Zustand over Redux/Context**: Minimal boilerplate. Perfect for connection state + streaming state that changes rapidly.

5. **Streaming via discrete tokens**: Each `CHAT_STREAM` message carries a small text chunk. Accumulated client-side. Finalized with `CHAT_STREAM_END`. This gives real-time feel like ChatGPT.

6. **Auth model**: Single-user system. JWT with a shared secret. The relay generates tokens for both the app and bridge. Simple, sufficient for personal use.

7. **Dark terminal aesthetic**: Since this is for a developer talking to coding agents, a dark theme with monospace code blocks feels right.

---

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| WS drops on mobile (backgrounding, network switch) | Aggressive reconnection + NetInfo listener + message queue |
| Expo Go limitations (no push notifications) | Use development builds for push testing; local notifications work in Expo Go |
| Agent stdout parsing varies wildly | Start with simple "line = token" approach, make adapter configurable |
| Relay single point of failure | Relay is stateless enough to restart quickly; messages buffered in app DB |
| expo-router migration complexity | Minimal pages needed; follow Expo's official migration guide |

---

## Verification Criteria

- [ ] Can send a message from phone → relay → bridge → agent
- [ ] Can receive streaming response: agent → bridge → relay → phone (token by token)
- [ ] Agent list updates in real-time when bridge connects/disconnects
- [ ] Chat history persists locally on phone across app restarts
- [ ] Reconnects automatically after network loss
- [ ] Push notification received when app is backgrounded
- [ ] Multiple agents can be registered and chatted with independently
