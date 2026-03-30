# Fix All Known Bugs & Gaps

## Analysis

After a full audit of the codebase, here are all the issues identified, grouped by severity:

### Critical Bugs (broken functionality)

- **HISTORY_RESPONSE never processed**: App sends `HISTORY_REQUEST` on reconnect but has no handler for `HISTORY_RESPONSE` — messages from the relay are silently dropped
- **Settings race condition**: `useWebSocket` runs in `_layout.tsx` on mount, but `token` is `null` until Settings screen loads from SecureStore — the app never auto-connects on launch
- **REST `/agents` endpoint broken**: Tries to call `getAgentList()` directly on DO stub object — must use internal `fetch()` instead

### Moderate Bugs (incorrect behavior)

- **App heartbeat sends empty `agentIds: []`**: The mobile `RelayClient` sends `AGENT_HEARTBEAT` with empty `agentIds` — it should either not send heartbeats or send a proper app-level ping. The relay harmlessly ignores it but it's wasteful and the message is semantically wrong for an app client
- **`settings` DB table defined but unused**: Drizzle schema defines it, migrations create it, but nothing reads/writes to it (SecureStore is used instead) — dead code
- **`before` cursor in `HISTORY_REQUEST` never used**: Protocol defines it, relay ignores it — `getHistory()` always returns latest N

### Minor Issues (polish)

- **Agent info not synced on status-only updates**: When `AGENT_STATUS` fires for a new agent not yet in the store, the agent won't show up because the store only calls `updateStatus` (which no-ops if agent doesn't exist). Need to also add the agent or request the full list
- **No HISTORY_RESPONSE handler in useChat**: Even after fixing useWebSocket to handle HISTORY_RESPONSE, useChat only reloads from DB on CHAT_STREAM_END/CHAT_RECEIVE — it needs to also reload when history arrives

---

## Steps

1. **Fix auto-connect on launch**: In `src/app/_layout.tsx`, add an initialization effect that loads `relay-url` and `relay-token` from `expo-secure-store` into the connection Zustand store BEFORE `useWebSocket` tries to connect. Create a new `src/hooks/useInitialize.ts` hook that loads credentials from SecureStore into the connection store, and call it at the top of `RootLayout` — it should set a `ready` flag so `useWebSocket` waits for initialization.

2. **Add HISTORY_RESPONSE handler to useWebSocket**: In `src/hooks/useWebSocket.ts`, add a handler for `MessageType.HISTORY_RESPONSE` that receives the `HistoryResponse` message, iterates over `message.messages`, and persists each one to local SQLite via `db.insert(schema.messages).values(...).onConflictDoNothing().run()`. Import `HistoryResponse` from `@agent-home/protocol`. Remember to unsubscribe in the cleanup function.

3. **Trigger useChat reload on HISTORY_RESPONSE**: In `src/hooks/useChat.ts`, add a third `relayClient.on(MessageType.HISTORY_RESPONSE, ...)` subscription that calls `loadMessages()` when the response's `agentId` matches. Import `MessageType.HISTORY_RESPONSE` (already available from the `MessageType` import). Unsubscribe in cleanup.

4. **Fix REST /agents endpoint in relay**: In `relay/src/index.ts`, change the `/agents` GET handler to use `stub.fetch(new Request('http://internal/agents'))` instead of casting stub to call `getAgentList()` directly. In `relay/src/durable-objects/relay-room.ts`, update the `fetch()` method to check if the request path is `/agents` (internal call) and return the agent list as JSON, otherwise proceed with the WebSocket upgrade auth flow.

5. **Fix app heartbeat**: In `src/lib/websocket.ts`, change the heartbeat from sending `AGENT_HEARTBEAT` with empty `agentIds` to sending a lightweight `AGENT_LIST` request instead (which serves as both a keepalive and agent sync). This reuses the existing message type properly — the relay will respond with the current agent list, keeping the app in sync.

6. **Remove unused settings table**: Delete the `settings` table definition from `src/db/schema.ts` (remove the `settings` export). Remove the `CREATE TABLE IF NOT EXISTS settings` block from the inline migration in `src/db/index.ts`. This is dead code since the app uses `expo-secure-store` for settings.

7. **Handle AGENT_STATUS for unknown agents**: In `src/hooks/useWebSocket.ts`, in the `AGENT_STATUS` handler, after calling `updateStatus(agentId, status)`, check if the agent exists in the store. If status is `'online'` and the agent doesn't exist in the store, send an `AGENT_LIST` request to the relay to fetch the full agent info: `relayClient.send({ id: nanoid(), type: MessageType.AGENT_LIST, timestamp: Date.now() })`.

8. **Add `before` cursor support to relay history**: In `relay/src/db/index.ts`, update the `getHistory()` function to accept an optional `before` parameter (timestamp number). When provided, add `AND created_at < ?` to the WHERE clause. In `relay/src/durable-objects/relay-room.ts` `handleHistoryRequest()`, pass `message.before` to `getHistory()`.
