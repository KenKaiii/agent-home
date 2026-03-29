# @agent-home/sdk

Lightweight, zero-dependency SDK to connect any Node.js project to [Agent Home](https://github.com/unstablemind/agent-home) as an agent.

## Installation

```bash
npm install @agent-home/sdk
```

## Quick Start

```ts
import { AgentHomeClient } from '@agent-home/sdk';

const client = new AgentHomeClient({
  relayUrl: 'wss://your-relay-server.example.com',
  token: 'your-bridge-token',
  agent: {
    id: 'my-agent',
    name: 'My Agent',
    description: 'A helpful assistant',
    capabilities: ['chat'],
  },
});

client.onMessage(async (message, stream) => {
  // Stream tokens as they're generated
  stream.token('Processing your request...\n');

  const result = await doWork(message.content);

  // Finalize with the complete response
  stream.end(result);
});

client.onConnect(() => {
  console.log('Connected to Agent Home relay');
});

client.onDisconnect(() => {
  console.log('Disconnected from relay');
});

client.connect();
```

## API

### `new AgentHomeClient(options)`

Creates a new client instance.

| Option               | Type        | Description                                    |
| -------------------- | ----------- | ---------------------------------------------- |
| `relayUrl`           | `string`    | WebSocket URL of the Agent Home relay          |
| `token`              | `string`    | Authentication token for the bridge connection |
| `agent.id`           | `string`    | Unique identifier for your agent               |
| `agent.name`         | `string`    | Display name                                   |
| `agent.description`  | `string?`   | Short description                              |
| `agent.icon`         | `string?`   | Icon URL or emoji                              |
| `agent.capabilities` | `string[]?` | List of capabilities                           |

### `client.connect()`

Opens the WebSocket connection to the relay. Automatically reconnects with exponential backoff on disconnection.

### `client.disconnect()`

Gracefully disconnects, unregistering the agent first.

### `client.onMessage(handler)`

Registers a handler for incoming chat messages.

```ts
client.onMessage(async (message, stream) => {
  // message.content  — the user's message text
  // message.userId   — who sent it
  // message.messageId — unique message ID
  // stream.token(text) — send a streaming token
  // stream.end(text)   — finalize with full content
  // stream.error(msg)  — send an error
});
```

### `client.onConnect(handler)`

Called when the WebSocket connection is established.

### `client.onDisconnect(handler)`

Called when the WebSocket connection is lost.

## Streaming Responses

The `ResponseStream` lets you stream tokens incrementally:

```ts
client.onMessage(async (message, stream) => {
  for await (const chunk of generateResponse(message.content)) {
    stream.token(chunk);
  }
  stream.end(fullResponse);
});
```

## Error Handling

Errors thrown in the message handler are automatically sent as error responses:

```ts
client.onMessage(async (message, stream) => {
  // If this throws, stream.error() is called automatically
  const result = await riskyOperation(message.content);
  stream.end(result);
});
```

You can also send errors explicitly:

```ts
stream.error('Something went wrong');
```

## Requirements

- Node.js 22+ (uses native `WebSocket`)

## License

MIT
