# Agent Home SDK Package

## Goal

Create a new publishable npm package `@agent-home/sdk` in the agent-home monorepo. This lightweight SDK lets any Node.js project connect to Agent Home as an agent with minimal code:

```ts
import { AgentHomeClient } from '@agent-home/sdk';

const client = new AgentHomeClient({
  relayUrl: 'wss://agent-home-relay...',
  token: 'bridge-token',
  agent: { id: 'my-agent', name: 'My Agent' },
});

client.onMessage(async (message, stream) => {
  stream.token('Processing...\n');
  const result = await doWork(message.content);
  stream.end(result);
});

client.connect();
```

## Architecture

The SDK consists of:

- **`AgentHomeClient`** — high-level API (connect, register, handle messages, stream responses)
- **Protocol types** — inlined (no Zod dependency for consumers), just TypeScript interfaces + enums
- **WebSocket transport** — auto-reconnect, heartbeat, message framing

The package is **zero-dependency** (uses native `WebSocket` from Node 22+) and ships as ESM + CJS with `.d.ts` types.

## Package Structure

```
sdk/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts          # Public exports
│   ├── client.ts         # AgentHomeClient class
│   ├── transport.ts      # WebSocket transport with reconnect/heartbeat
│   └── types.ts          # Protocol enums + interfaces (inlined, no zod)
```

## API Design

### `AgentHomeClient`

```ts
interface AgentHomeClientOptions {
  relayUrl: string;
  token: string;
  agent: {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    capabilities?: string[];
  };
}

interface IncomingMessage {
  content: string;
  userId: string;
  messageId: string;
}

interface ResponseStream {
  token(text: string): void; // Send streaming token
  end(content: string): void; // Finalize with full content
  error(message: string): void; // Send error
}

class AgentHomeClient {
  constructor(options: AgentHomeClientOptions);
  connect(): void;
  disconnect(): void;
  onMessage(
    handler: (message: IncomingMessage, stream: ResponseStream) => void | Promise<void>,
  ): void;
  onConnect(handler: () => void): void;
  onDisconnect(handler: () => void): void;
}
```

## Steps

1. Create `sdk/package.json` with name `@agent-home/sdk`, version `0.1.0`, zero dependencies, tsup for build, and add `"sdk"` to root `package.json` workspaces array
2. Create `sdk/tsconfig.json` targeting ES2022, strict mode, outDir dist
3. Create `sdk/tsup.config.ts` to build ESM + CJS with dts
4. Create `sdk/src/types.ts` with inlined MessageType enum, AgentStatus enum, AgentInfo interface, and all bridge-relevant message interfaces (no zod)
5. Create `sdk/src/transport.ts` with a `Transport` class: WebSocket connection using native globalThis.WebSocket, auto-reconnect with exponential backoff, 30s heartbeat, typed send/on methods
6. Create `sdk/src/client.ts` with `AgentHomeClient` class: wraps Transport, auto-registers agent on connect, creates `ResponseStream` per incoming `ChatForward`, exposes `onMessage`/`onConnect`/`onDisconnect` callbacks
7. Create `sdk/src/index.ts` exporting `AgentHomeClient`, all types, and enums
8. Add `"sdk"` to root `package.json` workspaces, run `npm install`, then build with `npx tsup` and verify no errors
9. Create `sdk/README.md` with usage examples showing connect, handle messages, stream responses
