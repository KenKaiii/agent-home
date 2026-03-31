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
    id: 'my-agent',
    name: 'My Agent',
  },
});

client.onMessage(async (message, stream) => {
  // Your logic here — call an LLM, query a DB, whatever
  stream.end('Hello!');
});

client.connect();
```

That's it. The SDK handles authentication, registration, heartbeats, and reconnection automatically.

## Getting a Token

You need a `relayUrl` and a `token`.

**From the iOS app:** Open Agent Home → Settings → "Generate SDK Token" → copy both values.

**HTTP API (programmatic):**

```ts
const response = await fetch('https://your-relay.workers.dev/auth/bridge-token', {
  method: 'POST',
  headers: { Authorization: `Bearer ${existingToken}` },
});
const { token, relayUrl } = await response.json();
```

**Provisioning secret (server-side):**

```bash
curl -X POST https://your-relay.workers.dev/auth/token \
  -H "Authorization: Bearer YOUR_PROVISIONING_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"clientType": "bridge"}'
```

## API

### `new AgentHomeClient(options)`

| Option              | Type     | Required | Description                                    |
| ------------------- | -------- | -------- | ---------------------------------------------- |
| `relayUrl`          | `string` | ✅       | WebSocket URL of the relay (`wss://...`)       |
| `token`             | `string` | ✅       | Bridge auth token                              |
| `agent.id`          | `string` | ✅       | Unique agent identifier (lowercase, no spaces) |
| `agent.name`        | `string` | ✅       | Display name in the app                        |
| `agent.description` | `string` |          | Shown below the agent name                     |

### `client.onMessage(handler)`

```ts
client.onMessage(async (message, stream) => {
  message.content; // string — the user's message
  message.sessionId; // string | undefined — which session this belongs to

  // Streaming (for LLMs / typewriter effect):
  stream.token('Hello ');
  stream.token('world!');
  stream.end('Hello world!'); // must call end() with the full assembled text

  // OR single response:
  stream.end('Here is my answer.');

  // OR error:
  stream.error('Something went wrong');
});
```

You **must** call `stream.end()` to complete every response, even when streaming.

### `client.onConnect(handler)` / `client.onDisconnect(handler)`

```ts
client.onConnect(() => console.log('Connected'));
client.onDisconnect(() => console.log('Disconnected'));
```

Auto-reconnect is built in (exponential backoff up to 30s). Only `client.disconnect()` stops it.

## Sessions (Optional)

Sessions let your agent expose multiple conversations to Agent Home. **Skip this entirely if you only need a single chat per agent.**

### How it works

1. Your agent maintains sessions and calls `client.updateSessions(sessions)` when the list changes.
2. Agent Home shows the session list. Users tap a session to chat in it, or start a new chat.
3. Your `onMessage` handler receives `message.sessionId` to route to the right conversation.
4. For new chats (`sessionId` is `undefined`), create a session and pass the new ID via `stream.end(content, { sessionId: newId })`.

### Complete example

```ts
import { AgentHomeClient, type AgentSession } from '@kenkaiiii/agent-home-sdk';

const sessions = new Map<string, { id: string; title: string; messages: string[] }>();

function createSession(title: string): string {
  const id = `session-${Date.now()}`;
  sessions.set(id, { id, title, messages: [] });
  pushSessions();
  return id;
}

function pushSessions() {
  const list: AgentSession[] = Array.from(sessions.values()).map((s) => ({
    id: s.id,
    title: s.title,
    updatedAt: Date.now(),
  }));
  client.updateSessions(list);
}

const client = new AgentHomeClient({
  relayUrl: 'wss://your-relay.workers.dev/ws',
  token: 'your-token',
  agent: { id: 'my-agent', name: 'My Agent' },
});

client.onMessage(async (message, stream) => {
  const { content, sessionId } = message;

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      stream.error(`Session ${sessionId} not found`);
      return;
    }
    session.messages.push(content);
    stream.end(`Echo: ${content}`); // sessionId is auto-tagged from the incoming message
  } else {
    // New chat — create a session and tag the response with its ID
    const title = content.length > 50 ? content.slice(0, 50) + '...' : content;
    const newSessionId = createSession(title);
    sessions.get(newSessionId)!.messages.push(content);
    stream.end(`Echo: ${content}`, { sessionId: newSessionId });
  }
});

// Optional: clean up your own state when a user deletes a session from the app
client.onSessionDelete((sessionId) => {
  sessions.delete(sessionId);
});

// Push existing sessions on connect/reconnect
client.onConnect(() => pushSessions());

client.connect();
```

### Key rules

- **`updateSessions()` is a full replacement** — always send the complete list, not a delta.
- **Call it after creating or renaming sessions.** You do **not** need to call it after deletions — the SDK automatically filters deleted sessions from all future `updateSessions()` calls. The relay also filters server-side.
- **`sessionId` is `undefined` for new chats** — create a session and pass the ID via `stream.end(content, { sessionId })`.
- **Existing sessions are auto-tagged** — when a message arrives with a `sessionId`, all `stream.token()` and `stream.end()` calls are tagged with it. The `{ sessionId }` override is only needed for new sessions.
- **`onSessionDelete` is for your own cleanup only** — remove the session from your internal state (maps, DB, etc.). The SDK and relay handle everything else.

## CLI Scaffolding

For new projects, scaffold in one command:

```bash
npx create-agent-home-agent \
  --url "wss://agent-home-relay.buzzbeamaustralia.workers.dev/ws" \
  --token "your-token" \
  --name "My Agent" \
  --yes
```

Creates a ready-to-run agent file with sessions support and installs the SDK.

| Flag                   | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `--url <url>`          | Relay WebSocket URL (required)                   |
| `--token <token>`      | Auth token (required)                            |
| `--name <name>`        | Agent display name (default: directory name)     |
| `--id <id>`            | Agent ID (default: derived from name)            |
| `--description <desc>` | Agent description                                |
| `--filename <file>`    | Output file (default: `agent.ts` or `agent.mjs`) |
| `--no-install`         | Skip `npm install`                               |
| `-y, --yes`            | No prompts, accept defaults                      |

## Types

```ts
import {
  AgentHomeClient,
  AgentHomeClientOptions,
  AgentInfo,
  AgentSession,
  IncomingMessage,
  ResponseStream,
  StreamOptions,
} from '@kenkaiiii/agent-home-sdk';
```

## Requirements

- Node.js 18+ (uses native `WebSocket`)
- A bridge token from Agent Home
- Tokens expire after 30 days
