# @kenkaiiii/agent-home-sdk

Connect any Node.js app to [Agent Home](https://github.com/kenkaiiii/agent-home) as an agent. Zero dependencies.

Your app connects to the relay as an **agent** — it receives user messages and sends responses back. The Agent Home iOS app is the **client** that users chat from.

## Quick Start

```bash
npm install @kenkaiiii/agent-home-sdk
```

```ts
import { AgentHomeClient } from '@kenkaiiii/agent-home-sdk';

const client = new AgentHomeClient({
  relayUrl: 'wss://your-relay.workers.dev/ws',
  token: 'your-bridge-token',
  agent: {
    id: 'my-agent', // unique, lowercase, no spaces
    name: 'My Agent', // display name shown in the app
    description: 'Optional', // shown below the name
  },
});

client.onMessage(async (message, stream) => {
  // Your logic here — call an LLM, query a DB, whatever
  stream.end('Hello!');
});

client.connect();
```

## Getting a Token

You need two values: a `relayUrl` and a `token`. There are three ways to get them.

**Option A — From the iOS app (easiest):**
Open Agent Home → Settings → "Generate SDK Token" → copy the token and relay URL.

**Option B — HTTP API (programmatic, for apps with a UI):**
If your app already has a valid token (app or bridge type), you can generate new bridge tokens from code:

```ts
const response = await fetch('https://your-relay.workers.dev/auth/bridge-token', {
  method: 'POST',
  headers: { Authorization: `Bearer ${existingToken}` },
});
const { token, relayUrl } = await response.json();
// token: new bridge JWT (expires in 30 days)
// relayUrl: the WebSocket URL to connect to (e.g. wss://your-relay.workers.dev/ws)
```

**Option C — Provisioning secret (for server-side automation):**

```bash
curl -X POST https://your-relay.workers.dev/auth/token \
  -H "Authorization: Bearer YOUR_PROVISIONING_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"clientType": "bridge"}'
# Returns: { "token": "...", "clientId": "..." }
```

## QR Code Pairing

Agent Home uses QR codes to pass connection credentials between apps. If your app wants to display a QR code for the Agent Home iOS app to scan, or if you want to display one for users to scan from _any_ Agent Home client:

### QR Payload Format

The QR code encodes a JSON string with this exact shape:

```json
{ "url": "wss://your-relay.workers.dev/ws", "token": "eyJhbG..." }
```

| Field   | Type     | Description                                               |
| ------- | -------- | --------------------------------------------------------- |
| `url`   | `string` | WebSocket relay URL (must start with `ws://` or `wss://`) |
| `token` | `string` | Bridge JWT token                                          |

### Recommended QR Libraries

| Platform               | Library                   | Install                                                              |
| ---------------------- | ------------------------- | -------------------------------------------------------------------- |
| **Node.js / CLI**      | `qrcode`                  | `npm install qrcode`                                                 |
| **React / Web**        | `qrcode.react`            | `npm install qrcode.react`                                           |
| **React Native**       | `react-native-qrcode-svg` | `npm install react-native-qrcode-svg` (requires `react-native-svg`)  |
| **Electron / Desktop** | `qrcode`                  | `npm install qrcode` (use `toDataURL()` or `toString('terminal')`)   |
| **Plain HTML**         | `qrcode-generator`        | CDN: `https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js` |

### Examples

**CLI — print QR to terminal:**

```ts
import QRCode from 'qrcode';

const data = JSON.stringify({ url: relayUrl, token });
console.log(await QRCode.toString(data, { type: 'terminal', small: true }));
```

**React / Web:**

```tsx
import { QRCodeSVG } from 'qrcode.react';

const data = JSON.stringify({ url: relayUrl, token });
<QRCodeSVG value={data} size={220} />;
```

**Electron — render in HTML:**

```ts
import QRCode from 'qrcode';

const data = JSON.stringify({ url: relayUrl, token });
const dataUrl = await QRCode.toDataURL(data, { width: 220 });
document.getElementById('qr').src = dataUrl;
```

**React Native:**

```tsx
import QRCode from 'react-native-qrcode-svg';

const data = JSON.stringify({ url: relayUrl, token });
<QRCode value={data} size={220} backgroundColor="#ffffff" color="#000000" />;
```

## API

### `new AgentHomeClient(options)`

| Option               | Type       | Required | Description                              |
| -------------------- | ---------- | -------- | ---------------------------------------- |
| `relayUrl`           | `string`   | ✅       | WebSocket URL of the relay (`wss://...`) |
| `token`              | `string`   | ✅       | Bridge auth token                        |
| `agent.id`           | `string`   | ✅       | Unique agent identifier                  |
| `agent.name`         | `string`   | ✅       | Display name in the app                  |
| `agent.description`  | `string`   |          | Shown below the agent name               |
| `agent.capabilities` | `string[]` |          | Tags for filtering (future use)          |

### `client.connect()`

Opens the WebSocket connection. Handles auth, reconnection (exponential backoff), and heartbeats automatically.

### `client.disconnect()`

Unregisters the agent and closes the connection. No auto-reconnect after this.

### `client.onMessage(handler)`

```ts
client.onMessage(async (message, stream) => {
  message.content; // string — the user's message text
  message.userId; // string — who sent it
  message.messageId; // string — unique message ID
  message.sessionId; // string | undefined — session context (if using sessions)

  // Streaming response (for LLMs / typewriter effect):
  stream.token('Hello '); // send incremental tokens
  stream.token('world!');
  stream.end('Hello world!'); // finalize with full assembled text

  // OR single complete response:
  stream.end('Here is my answer.');

  // OR error:
  stream.error('Something went wrong');
});
```

The `stream` object has three methods:

| Method                          | Description                                              |
| ------------------------------- | -------------------------------------------------------- |
| `stream.token(text, options?)`  | Send a streaming chunk (appears in real-time in the app) |
| `stream.end(content, options?)` | Finalize the response with the complete text             |
| `stream.error(message)`         | Send an error message                                    |

The optional `options` parameter accepts `{ sessionId?: string }` to override the session for this response. This is useful when creating a new session for a message that arrived without one (see [Sessions](#sessions-optional) below).

You **must** call `stream.end()` to complete every response, even when streaming.

### `client.updateSessions(sessions)`

Push an updated list of sessions (conversations/threads) for this agent. The iOS app will receive the list and can route messages to specific sessions via `message.sessionId`.

```ts
client.updateSessions([
  { id: 'session-1', title: 'Research task', updatedAt: Date.now() },
  { id: 'session-2', title: 'Code review', updatedAt: Date.now() },
]);
```

Each session object:

| Field       | Type     | Description                  |
| ----------- | -------- | ---------------------------- |
| `id`        | `string` | Unique session identifier    |
| `title`     | `string` | Display title                |
| `updatedAt` | `number` | Last activity timestamp (ms) |

### Sessions (Optional)

Sessions let your agent expose multiple conversations/threads to Agent Home. Without sessions, your agent has a single flat chat. With sessions, each conversation is isolated by a `sessionId`.

**This is fully optional.** If you never call `updateSessions()`, everything works exactly as before — a single chat per agent.

#### How it works

1. Your app maintains a list of sessions (conversations, threads, projects — whatever makes sense).
2. You call `client.updateSessions(sessions)` whenever the list changes (session created, renamed, deleted).
3. Agent Home receives the session list and can send messages scoped to a specific session.
4. Your `onMessage` handler receives `message.sessionId` — use it to route the message to the correct conversation.
5. The response stream automatically tags replies with the same `sessionId`.

#### Complete implementation example

```ts
import { AgentHomeClient, type AgentSession } from '@kenkaiiii/agent-home-sdk';

// 1. Track your sessions however you want (DB, in-memory, file, etc.)
const sessions = new Map<string, { id: string; title: string; messages: string[] }>();

function createSession(title: string): string {
  const id = `session-${Date.now()}`;
  sessions.set(id, { id, title, messages: [] });
  pushSessions(); // always push after changes
  return id;
}

function deleteSession(id: string) {
  sessions.delete(id);
  pushSessions();
}

// 2. Push the current session list to Agent Home whenever it changes
function pushSessions() {
  const list: AgentSession[] = Array.from(sessions.values()).map((s) => ({
    id: s.id,
    title: s.title,
    updatedAt: Date.now(),
  }));
  client.updateSessions(list);
}

// 3. Create the client
const client = new AgentHomeClient({
  relayUrl: 'wss://your-relay.workers.dev/ws',
  token: 'your-token',
  agent: { id: 'my-agent', name: 'My Agent' },
});

// 4. Handle messages — use sessionId to route to the correct conversation
client.onMessage(async (message, stream) => {
  const { content, sessionId } = message;

  if (sessionId) {
    // Message is scoped to an existing session
    const session = sessions.get(sessionId);
    if (!session) {
      stream.error(`Session ${sessionId} not found`);
      return;
    }
    session.messages.push(content);
    const response = await processWithContext(session.messages);
    stream.end(response); // sessionId auto-tagged from incoming message
  } else {
    // No sessionId — user started a new chat. Create a session for it.
    const title = content.length > 50 ? content.slice(0, 50) + '...' : content;
    const newSessionId = createSession(title);
    const session = sessions.get(newSessionId)!;
    session.messages.push(content);
    const response = await process(content);
    // Pass the new sessionId so Agent Home associates this response with the new session
    stream.end(response, { sessionId: newSessionId });
  }
});

// 5. Push initial sessions on connect
client.onConnect(() => {
  pushSessions();
});

client.connect();
```

#### Real-Time Sync

Agent Home keeps sessions in sync between your agent and all connected iOS apps:

- **`updateSessions()` is a full replacement** — always send the complete list of sessions, not a delta. Any session omitted from the list will be removed from Agent Home.
- **Call it after every change** — whether you create, delete, or rename a session, call `updateSessions()` immediately so the iOS app reflects the change.
- **Agent Home refreshes on screen focus** — the sessions screen requests fresh data from the relay every time it gains focus, so even if a real-time update was missed, navigating to the screen will recover.
- **New session creation triggers a refresh** — when a new chat adopts a `sessionId` from the agent's response, Agent Home automatically requests the latest agent list from the relay.
- **The relay broadcasts to all connected apps** — when you call `updateSessions()`, the relay stores the list and broadcasts it to every connected iOS app in real-time via WebSocket.

#### Key rules

- **Always call `updateSessions()` after any change** — creating, renaming, or deleting sessions. Agent Home replaces its entire session list each time.
- **`sessionId` is `undefined` for new chats** — when the user starts a new conversation from Agent Home, `message.sessionId` will be `undefined`. Your agent should create a new session and pass the new `sessionId` via `stream.end(content, { sessionId: newId })` so Agent Home can associate the response with the new session.
- **Use `{ sessionId }` override for new sessions** — `stream.token(text, { sessionId })` and `stream.end(content, { sessionId })` accept an optional override. Use this when responding to a sessionless message after creating a new session. For existing sessions, the sessionId is auto-tagged from the incoming message and no override is needed.
- **Session IDs are opaque strings** — Agent Home passes them through unchanged. Use any format you want (UUIDs, slugs, timestamps, etc.).
- **The relay persists sessions** — sessions survive reconnects. They're stored alongside the agent registration and broadcast to all connected apps.
- **Response streams are auto-tagged for existing sessions** — when a message arrives with a `sessionId`, all `stream.token()` and `stream.end()` calls are automatically tagged with that `sessionId`. You only need the override for new sessions (where the incoming `sessionId` is `undefined`).

### `client.onConnect(handler)`

Called when the WebSocket connects and auth succeeds. Your agent is registered and visible in the app.

### `client.onDisconnect(handler)`

Called when the WebSocket disconnects. If `disconnect()` was not called explicitly, the SDK will auto-reconnect.

## What the SDK Handles

- **Authentication** — sends the JWT on connect, no manual auth needed
- **Agent registration** — automatically registers/unregisters your agent with the relay
- **Heartbeats** — keeps the connection alive (every 30s)
- **Reconnection** — exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max)
- **Message routing** — only delivers messages addressed to your agent
- **Error logging** — relay errors (e.g. `AGENT_ALREADY_REGISTERED`) are logged to `console.error`

## Integration Pattern

Typical pattern for adding Agent Home to an existing app with settings UI:

```ts
import { AgentHomeClient } from '@kenkaiiii/agent-home-sdk';

let client: AgentHomeClient | null = null;

// Call this when the user enables Agent Home or on app startup
export function startAgentHome(config: { relayUrl: string; token: string; name: string }) {
  client = new AgentHomeClient({
    relayUrl: config.relayUrl,
    token: config.token,
    agent: {
      id: config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: config.name,
    },
  });

  client.onMessage(async (message, stream) => {
    try {
      // Wire into your existing message processing
      const response = await yourExistingHandler(message.content);
      stream.end(response);
    } catch (err) {
      stream.error(err instanceof Error ? err.message : 'Unknown error');
    }
  });

  client.onConnect(() => console.log('[agent-home] Connected'));
  client.onDisconnect(() => console.log('[agent-home] Disconnected'));
  client.connect();
}

// Call this when the user disables Agent Home or on app shutdown
export function stopAgentHome() {
  client?.disconnect();
  client = null;
}

// Check if currently connected
export function isAgentHomeRunning(): boolean {
  return client !== null;
}
```

### Settings Your App Needs

If you're adding Agent Home as a configurable feature, you need these user-facing settings:

| Setting    | Type      | Default                                                   | Notes                                      |
| ---------- | --------- | --------------------------------------------------------- | ------------------------------------------ |
| Enabled    | `boolean` | `false`                                                   | Toggle to start/stop the connection        |
| Relay URL  | `string`  | `wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws` | Rarely changed by users                    |
| Token      | `string`  | (empty)                                                   | Treat as a secret — store encrypted/secure |
| Agent Name | `string`  | Your app's name                                           | Display name in Agent Home                 |

The relay URL and token come from QR code scanning or manual paste — see "Getting a Token" and "QR Code Pairing" above.

## CLI Scaffolding

For new projects, skip all the above and scaffold in one command:

```bash
npx create-agent-home-agent \
  --url "wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws" \
  --token "your-token" \
  --name "My Agent" \
  --yes
```

This creates a ready-to-run agent file and installs the SDK. All flags:

| Flag                   | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `--url <url>`          | Relay WebSocket URL (required)                   |
| `--token <token>`      | Auth token (required)                            |
| `--name <name>`        | Agent display name (default: directory name)     |
| `--id <id>`            | Agent ID (default: derived from name)            |
| `--description <desc>` | Agent description                                |
| `--filename <file>`    | Output file (default: `agent.ts` or `agent.mjs`) |
| `--no-install`         | Skip `npm install` of the SDK                    |
| `-y, --yes`            | No prompts — accept defaults, overwrite existing |

## Types

All types are exported:

```ts
import {
  AgentHomeClient,
  AgentHomeClientOptions,
  AgentInfo,
  AgentSession,
  AgentStatus,
  IncomingMessage,
  MessageType,
  ResponseStream,
  StreamOptions,
} from '@kenkaiiii/agent-home-sdk';
```

## Requirements

- Node.js 18+ (uses native `WebSocket`)
- A bridge token from Agent Home (see "Getting a Token" above)
- Tokens expire after 30 days
