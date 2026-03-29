# Relay Server → Cloudflare Workers + Durable Objects + D1

## Overview
Rewrite the relay server from a Node.js process (Hono + ws + better-sqlite3) to a Cloudflare Workers deployment using:
- **Hono** on Workers (already supports CF natively)
- **Durable Objects** with WebSocket Hibernation for WS state management
- **D1** for SQLite persistence (messages, agents, devices)
- **jose** for JWT (replaces `jsonwebtoken` which uses Node crypto)

## Architecture

```
Phone App ──wss──→ CF Worker (Hono routes) ──→ Durable Object (RelayRoom)
                                                  ├── WebSocket state (app clients, bridge clients)
                                                  ├── Message routing
                                                  └── D1 queries (history, persistence)
Laptop Bridge ──wss──→ same CF Worker ──→ same Durable Object
```

The Worker handles HTTP routes (health, auth, agents, device registration).
WebSocket upgrades are forwarded to a single Durable Object instance (`RelayRoom`) that manages all connections using the Hibernation API.

## Current Files to Change

| Current File | Action | New File |
|---|---|---|
| `relay/package.json` | Rewrite — remove node deps, add CF deps | `relay/package.json` |
| `relay/tsconfig.json` | Update for CF Workers types | `relay/tsconfig.json` |
| `relay/src/index.ts` | Delete — Workers use default export | — |
| `relay/src/server.ts` | Rewrite — Hono on Workers + DO routing | `relay/src/index.ts` |
| `relay/src/ws/handler.ts` | Delete — merged into DO class | — |
| `relay/src/ws/router.ts` | Rewrite — becomes methods on DO class | `relay/src/durable-objects/relay-room.ts` |
| `relay/src/ws/auth.ts` | Adapt — CF Request instead of Node IncomingMessage | `relay/src/lib/auth.ts` |
| `relay/src/db/index.ts` | Rewrite — D1 prepared statements | `relay/src/db/index.ts` |
| `relay/src/db/schema.ts` | Convert to D1 migration SQL file | `relay/migrations/0001_init.sql` |
| `relay/src/lib/token.ts` | Rewrite — `jose` instead of `jsonwebtoken` | `relay/src/lib/token.ts` |
| `relay/src/lib/push.ts` | Keep as-is (uses standard fetch) | `relay/src/lib/push.ts` |
| `relay/.env` | Delete — use wrangler secrets | — |
| `relay/.env.example` | Delete | — |
| — | New — wrangler config | `relay/wrangler.toml` |

## Final File Structure

```
relay/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── migrations/
│   └── 0001_init.sql
└── src/
    ├── index.ts              # Hono app + default export + DO re-export
    ├── durable-objects/
    │   └── relay-room.ts     # DurableObject with WS Hibernation
    ├── db/
    │   └── index.ts          # D1 query helpers
    ├── lib/
    │   ├── auth.ts           # Token verify from URL params
    │   ├── token.ts          # JWT sign/verify using jose
    │   └── push.ts           # Expo push notification sender
    └── types.ts              # Env bindings type
```

## Key Differences from Node Version

- **No `ws` library** — use `WebSocketPair` + `this.ctx.acceptWebSocket()`
- **No `better-sqlite3`** — use `env.DB.prepare()` (D1 binding)
- **No `jsonwebtoken`** — use `jose` (pure JS, works in Workers)
- **No `dotenv`** — use `wrangler secret put` for secrets
- **No `nanoid`** — use `crypto.randomUUID()` (available in Workers)
- **State lives in Durable Object** — `appClients`, `bridgeClients`, `agents` maps are instance properties on the DO class
- **Hibernation** — WebSockets survive DO eviction; state is reconstructed via `serializeAttachment` / `deserializeAttachment`

## Risks

- D1 has a 10MB database size limit on free plan (fine for now)
- Durable Objects have a single-instance model — all WS connections go through one DO instance (fine for personal use, would need sharding for scale)
- `jose` JWT API is slightly different from `jsonwebtoken` — need async sign/verify
- Need to handle that D1 queries are async (unlike better-sqlite3 sync `.run()`)

## Steps

1. Update `relay/package.json` — remove all Node dependencies (`ws`, `better-sqlite3`, `@hono/node-server`, `dotenv`, `jsonwebtoken`, `drizzle-orm`, `drizzle-kit`, and their `@types`), add `hono`, `jose`, `@cloudflare/workers-types`, `wrangler` as devDep, keep `zod` and `@agent-home/protocol`
2. Create `relay/wrangler.toml` with D1 database binding (`DB`), Durable Object binding (`RELAY_ROOM` → `RelayRoom` class), `[vars]` for non-secret config, compatibility flags `nodejs_compat`, and main entry `src/index.ts`
3. Create `relay/migrations/0001_init.sql` — convert the existing inline CREATE TABLE statements from `relay/src/db/index.ts` into a D1 migration file (agents, messages, devices tables + indexes)
4. Create `relay/src/types.ts` — define `Env` interface with `Bindings: { DB: D1Database; RELAY_ROOM: DurableObjectNamespace; JWT_SECRET: string }` for Hono generics
5. Rewrite `relay/src/lib/token.ts` — replace `jsonwebtoken` with `jose` (`SignJWT` for signing, `jwtVerify` for verification), make `createToken` and `verifyToken` async
6. Rewrite `relay/src/lib/auth.ts` (was `relay/src/ws/auth.ts`) — extract token from URL search params on a standard `Request` object (not Node `IncomingMessage`), call async `verifyToken`
7. Rewrite `relay/src/db/index.ts` — export helper functions that take a `D1Database` parameter and use `db.prepare(sql).bind(...params).run()` / `.all()` / `.first()` for: `insertMessage`, `getHistory`, `upsertAgent`, `upsertDevice`, `getDevicesByType`
8. Keep `relay/src/lib/push.ts` unchanged (already uses standard `fetch`)
9. Create `relay/src/durable-objects/relay-room.ts` — implement `RelayRoom extends DurableObject` with: constructor that restores sessions from `this.ctx.getWebSockets()` + `deserializeAttachment`, `fetch()` method that authenticates the upgrade request and calls `this.ctx.acceptWebSocket(server)` with serialized attachment `{ clientId, clientType }`, `webSocketMessage(ws, message)` that parses the message with `RelayMessage.safeParse()` and calls the routing logic (adapted from current `router.ts`), `webSocketClose(ws)` that handles cleanup and broadcasts agent offline status, and private routing methods: `handleChatSend`, `handleAgentRegister`, `handleAgentUnregister`, `handleHeartbeat`, `handleAgentList`, `handleHistoryRequest`, `broadcastToApps`, `notifyDisconnectedApps` — all adapted from current `router.ts` but using `this.ctx.getWebSockets()` and `this.env.DB` for D1 queries
10. Rewrite `relay/src/index.ts` — Hono app with CF Workers bindings: `GET /health`, `POST /auth/token`, `GET /agents`, `POST /devices/register` (all using `c.env.DB` for D1), WebSocket upgrade route `GET /ws` that gets the DO stub via `c.env.RELAY_ROOM.getByName('relay')` and returns `stub.fetch(request)`, then `export default app` and `export { RelayRoom }` for the DO class
11. Update `relay/tsconfig.json` — add `@cloudflare/workers-types` to types, set `target: ESNext`, `module: ESNext`, `moduleResolution: bundler`, remove protocol include/paths (protocol is bundled by wrangler)
12. Delete old files: `relay/src/server.ts`, `relay/src/ws/handler.ts`, `relay/src/ws/router.ts`, `relay/src/ws/auth.ts`, `relay/src/db/schema.ts`, `relay/.env`, `relay/.env.example`
13. Run `cd relay && npm install` to install new deps, then `npx wrangler types` to generate worker-configuration.d.ts, then `npx tsc --noEmit` to verify compilation
14. Test locally with `npx wrangler dev` — verify health endpoint, token generation, and WebSocket upgrade all work
