# Agent Home

Mobile-first unified chat interface for multiple AI agents. Built with Expo/React Native, connected via a Cloudflare Workers WebSocket relay. Agents connect through a local bridge process or the public SDK.

**Architecture:** `Mobile App ↔ Relay (CF Workers + Durable Objects) ↔ Bridge/SDK → Agents`

## Project Structure

```
protocol/        Shared Zod schemas & enums (MessageType, AgentStatus, message types)
relay/           Cloudflare Workers relay — Hono HTTP, Durable Object WebSocket hub, D1, JWT auth
bridge/          Node.js daemon — connects to relay, spawns/manages local agents (stdio/HTTP)
sdk/             Publishable @kenkaiiii/agent-home-sdk — zero-dep client for 3rd-party agents
src/             Expo Router mobile app
  app/           File-based routing (tabs: agents list, settings; dynamic: chat/[agentId])
  components/    UI components (AgentCard, ChatBubble, ChatInput, StreamingText, etc.)
  db/            Drizzle ORM + expo-sqlite (agents, messages, settings tables)
  hooks/         React hooks (useAgents, useChat, useWebSocket, useNotifications)
  stores/        Zustand stores (agents, messages, connection state)
  lib/           Config, constants, WebSocket client wrapper
  types/         TypeScript interfaces
assets/          App icons & splash images
ios/             Native iOS build artifacts (Xcode + CocoaPods)
```

## Tech Stack

- **App:** Expo 55, React 19, React Native 0.83, Expo Router, Zustand, Drizzle ORM
- **Relay:** Hono on Cloudflare Workers, Durable Objects, D1, jose (JWT)
- **Bridge:** Node.js + tsx, ws, chalk, tree-kill
- **SDK:** tsup (ESM + CJS dual output), zero dependencies
- **Shared:** TypeScript 5.9, Zod for schemas
- **Path alias:** `@/*` → `./src/*`

## Quality Checks

```bash
# Lint (ESLint 9 flat config + Prettier plugin)
npm run lint

# Lint with auto-fix
npm run lint:fix

# Type check (all workspaces)
npm run typecheck

# Format check
npm run format:check

# Format fix
npm run format
```

Pre-commit hook (Husky + lint-staged) runs ESLint + Prettier on staged `.ts`/`.tsx` files.

**No test runner is configured.** There are no jest/vitest scripts or test files.

## Code Organization Rules

- One component per file in `src/components/`
- One store per file in `src/stores/`
- One hook per file in `src/hooks/`
- Screens live in `src/app/` following Expo Router file conventions
- Shared protocol types go in `protocol/src/`, not duplicated across packages
- Agent transports in `bridge/src/agents/` extend the base agent abstraction

## Workspace Commands

```bash
# Mobile app
npm start                          # expo start
npm run ios                        # expo run:ios

# Relay server
npm run dev -w relay               # wrangler dev
npm run deploy -w relay            # wrangler deploy
npm run db:migrate:local -w relay  # run D1 migrations locally

# Bridge
npm run dev -w bridge              # tsx watch src/index.ts

# SDK
npm run build -w sdk               # tsup build
```
