import { db, schema } from '@/db';
import { useAgentsStore } from '@/stores/agents';
import { useConnectionStore } from '@/stores/connection';
import type { Agent, ConnectedApp } from '@/types';

const now = Date.now();
const min = 60 * 1000;

const MOCK_APPS: ConnectedApp[] = [
  {
    id: 'agent-home-app',
    name: 'Agent Home',
    hostName: "Ken's MacBook Pro",
    platform: 'macos',
    appVersion: '1.0.0',
    agentCount: 3,
    lastActiveAt: now - 2 * min,
  },
  {
    id: 'buzzbeam-app',
    name: 'BuzzBeam Dashboard',
    hostName: 'buzzbeam-prod-01',
    platform: 'linux',
    appVersion: '2.3.1',
    agentCount: 2,
    lastActiveAt: now - 10 * min,
  },
];

const MOCK_AGENTS: Agent[] = [
  {
    id: 'claude-code',
    appId: 'agent-home-app',
    name: 'Claude Code',
    description: 'Full-stack coding assistant',
    status: 'online',
    lastMessage: 'Done — deployed to production.',
    lastMessageAt: now - 2 * min,
  },
  {
    id: 'research-agent',
    appId: 'agent-home-app',
    name: 'Research Agent',
    description: 'Deep research & analysis',
    status: 'online',
    lastMessage: 'Here are the key findings from the report...',
    lastMessageAt: now - 15 * min,
  },
  {
    id: 'writer-agent',
    appId: 'agent-home-app',
    name: 'Writer',
    description: 'Content & copywriting',
    status: 'online',
    lastMessage: 'Draft ready for review.',
    lastMessageAt: now - 45 * min,
  },
  {
    id: 'devops-agent',
    appId: 'buzzbeam-app',
    name: 'DevOps Agent',
    description: 'Infrastructure & deployments',
    status: 'busy',
    lastMessage: 'Running terraform plan now...',
    lastMessageAt: now - 5 * min,
  },
  {
    id: 'data-agent',
    appId: 'buzzbeam-app',
    name: 'Data Pipeline',
    description: 'ETL & data transformation',
    status: 'offline',
    lastMessage: 'Pipeline completed — 14,328 rows processed.',
    lastMessageAt: now - 3 * 60 * min,
  },
];

interface MockMessage {
  id: string;
  agentId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

const MOCK_MESSAGES: MockMessage[] = [
  // ── Claude Code conversation (code blocks, inline code, ordered lists, tables) ──
  {
    id: 'cc-1',
    agentId: 'claude-code',
    role: 'user',
    content: 'Can you add device metadata to the QR pairing flow?',
    createdAt: now - 35 * min,
  },
  {
    id: 'cc-2',
    agentId: 'claude-code',
    role: 'assistant',
    content:
      "Sure. I'll add `device_name`, `platform`, and `app_version` columns to the devices table, then update the relay endpoints and the app-side calls.\n\nHere's the plan:\n1. D1 migration with `ALTER TABLE` statements\n2. Update `upsertDevice` to accept metadata\n3. Add auth to endpoints\n4. Send metadata from `scan.tsx` after QR pair",
    createdAt: now - 34 * min,
  },
  {
    id: 'cc-3',
    agentId: 'claude-code',
    role: 'user',
    content: 'Sounds good, go ahead.',
    createdAt: now - 33 * min,
  },
  {
    id: 'cc-4',
    agentId: 'claude-code',
    role: 'assistant',
    content:
      "All done. Here's what changed:\n\n```sql\nALTER TABLE devices ADD COLUMN device_name TEXT;\nALTER TABLE devices ADD COLUMN platform TEXT;\nALTER TABLE devices ADD COLUMN app_version TEXT;\nALTER TABLE devices ADD COLUMN updated_at INTEGER;\n```\n\nThe `upsertDevice` function now accepts an optional metadata object:\n\n```typescript\ninterface DeviceMetadata {\n  deviceName?: string;\n  platform?: 'ios' | 'android' | 'web';\n  appVersion?: string;\n}\n\nasync function upsertDevice(\n  db: D1Database,\n  clientId: string,\n  pushToken: string,\n  metadata?: DeviceMetadata\n): Promise<void>\n```\n\n### Endpoints updated\n\n| Endpoint | Method | Auth | Change |\n|----------|--------|------|--------|\n| `/devices/register` | POST | Bearer | Accepts `deviceName`, `platform`, `appVersion` |\n| `/devices` | GET | Bearer | Returns all devices with metadata |\n| `/auth/pair` | POST | None | *No change* |\n\nPlatform is validated against `['ios', 'android', 'web']`. Invalid values get a `400` response.\n\n---\n\nDeployed to production. ✅",
    createdAt: now - 30 * min,
  },
  {
    id: 'cc-5',
    agentId: 'claude-code',
    role: 'user',
    content: 'Can you also add input validation for the push token format?',
    createdAt: now - 10 * min,
  },
  {
    id: 'cc-6',
    agentId: 'claude-code',
    role: 'assistant',
    content:
      "Done. Push tokens are now validated before storage.\n\n**Validation rules:**\n- Must match `ExponentPushToken[...]` format\n- Token body must be alphanumeric + hyphens, 20–50 chars\n- Empty strings are rejected\n\n```typescript\nconst PUSH_TOKEN_REGEX = /^ExponentPushToken\\[[a-zA-Z0-9\\-]{20,50}\\]$/;\n\nif (!PUSH_TOKEN_REGEX.test(pushToken)) {\n  return c.json({ error: 'Invalid push token format' }, 400);\n}\n```\n\n> **Note:** This only validates the *format* — it doesn't verify the token is actually registered with Expo's push service. That happens at send-time.\n\nDeployed. Invalid tokens now get a `400` with a descriptive error message.",
    createdAt: now - 2 * min,
  },

  // ── Research Agent conversation (headings, tables, blockquotes, bold/italic, lists, HR) ──
  {
    id: 'ra-1',
    agentId: 'research-agent',
    role: 'user',
    content: 'Compare WebSocket vs SSE for real-time mobile apps',
    createdAt: now - 120 * min,
  },
  {
    id: 'ra-2',
    agentId: 'research-agent',
    role: 'assistant',
    content:
      '## WebSocket vs SSE for Mobile\n\n**WebSocket** is bidirectional — ideal when the client needs to send frequent messages (chat, commands). Battery impact is higher due to persistent connections.\n\n**SSE** is server-push only over HTTP — simpler, auto-reconnects, and works through HTTP/2 multiplexing. Better for one-way feeds (notifications, dashboards).\n\n### Feature Comparison\n\n| Feature | WebSocket | SSE |\n|---------|-----------|-----|\n| Direction | Bidirectional | Server → Client only |\n| Protocol | `ws://` / `wss://` | HTTP/1.1 or HTTP/2 |\n| Reconnect | Manual | Built-in |\n| Binary data | ✅ Yes | ❌ No (text only) |\n| Battery impact | Higher | Lower |\n| Browser support | All modern | All modern |\n| Through proxies | Sometimes blocked | Always works |\n\n### Recommendation\nFor a chat app with agent interactions: **WebSocket**. You need bidirectional communication for sending messages and receiving streamed responses.\n\n> SSE would work for a read-only agent dashboard but not for interactive chat.\n\n---\n\n*Sources: MDN Web Docs, Cloudflare Workers documentation, IETF RFC 6455*',
    createdAt: now - 115 * min,
  },
  {
    id: 'ra-3',
    agentId: 'research-agent',
    role: 'user',
    content: 'What about connection reliability on mobile networks?',
    createdAt: now - 100 * min,
  },
  {
    id: 'ra-4',
    agentId: 'research-agent',
    role: 'assistant',
    content:
      "# Mobile Connection Reliability\n\nMobile networks are inherently unstable — connections drop during cell tower handoffs, Wi-Fi transitions, and backgrounding.\n\n## Key Patterns\n\n### 1. Reconnection Strategy\n- **Exponential backoff** — you're already doing this: 1s → 2s → 4s → 30s cap\n- **Jitter** — add randomness to prevent thundering herd on server restart\n- Cap at ~30 seconds; beyond that, users assume the app is broken\n\n### 2. Message Durability\n- Queue outbound messages during disconnects\n- Flush queue on reconnect with ordering guarantees\n- Store messages locally (SQLite) so nothing is lost\n\n### 3. Connection Health\n- **Heartbeat/ping** every 30s to detect stale connections\n- Server-side timeout at 60s of silence\n- ~~Long-polling fallback~~ — not needed with Durable Objects\n\n### 4. State Synchronization\n\n| Event | Client Action | Server Action |\n|-------|--------------|---------------|\n| Disconnect | Queue messages, start backoff | Mark connection stale |\n| Reconnect | Send `lastMessageId` | Replay missed messages |\n| Background | Keep socket 30s, then close | Hold state in DO |\n| Foreground | Reconnect + sync | Replay from cursor |\n\n## Your Architecture\n\nYour current setup handles all of these well:\n\n1. ✅ Exponential backoff with cap\n2. ✅ Local SQLite message storage\n3. ✅ Durable Objects hold server-side state\n4. ⚠️ *Consider adding*: message cursor sync on reconnect\n\n> **Bottom line:** The architecture is solid. The only gap is cursor-based replay on reconnect — everything else is already in place.",
    createdAt: now - 95 * min,
  },
  {
    id: 'ra-5',
    agentId: 'research-agent',
    role: 'user',
    content: 'Give me a quick summary of React Native performance tips',
    createdAt: now - 60 * min,
  },
  {
    id: 'ra-6',
    agentId: 'research-agent',
    role: 'assistant',
    content:
      '## React Native Performance Cheat Sheet\n\n### Rendering\n- Use `React.memo()` for pure components — prevents re-renders when props haven\'t changed\n- Use `useCallback` and `useMemo` for expensive computations and callback stability\n- Avoid **anonymous functions** in JSX props: `onPress={() => handle(id)}` creates new refs every render\n\n### Lists\n- **Always** use `FlatList` or `FlashList` over `ScrollView` for dynamic lists\n- Set `keyExtractor` to a *stable, unique* string\n- Use `getItemLayout` when row height is fixed — skips measurement\n- `windowSize={5}` reduces off-screen rendering (default is 21)\n\n### Images\n- Use `expo-image` instead of `<Image>` — better caching, blurhash placeholders\n- Always specify `width` and `height` — prevents layout thrashing\n- Prefer WebP over PNG/JPEG (30% smaller)\n\n### Navigation\n- Lazy-load heavy screens with `React.lazy()` + `Suspense`\n- ~~Pre-render all tabs on mount~~ — don\'t do this, defeats the purpose of lazy loading\n\n### Memory\n\n| Issue | Symptom | Fix |\n|-------|---------|-----|\n| Listener leaks | Growing memory | Clean up in `useEffect` return |\n| Large images | OOM crash | Resize before display |\n| Zustand subscriptions | Stale renders | Use selectors, not full store |\n| Timers | Background drain | Clear in `useEffect` cleanup |\n\n---\n\n> *"The fastest code is code that never runs."* — Optimize renders first, then worry about execution speed.',
    createdAt: now - 55 * min,
  },

  // ── DevOps Agent conversation (code blocks, terminal output, nested lists) ──
  {
    id: 'do-1',
    agentId: 'devops-agent',
    role: 'user',
    content: 'Deploy the relay to production',
    createdAt: now - 20 * min,
  },
  {
    id: 'do-2',
    agentId: 'devops-agent',
    role: 'assistant',
    content:
      'Running `wrangler deploy`...\n\n```\n✓ Built successfully\n✓ Uploaded worker (2.1s)\n✓ Published agent-home-relay\n  https://agent-home-relay.buzzbeamaustralia.workers.dev\n  Current Version ID: a1b2c3d4-5678-90ab-cdef-1234567890ab\n```\n\n### Post-deploy checks\n\n- ✅ Worker deployed successfully\n- ✅ D1 migrations applied (2 of 2)\n- ✅ Durable Object bindings verified\n- ✅ Environment variables set\n  - `JWT_SECRET` — present\n  - `EXPO_ACCESS_TOKEN` — present\n  - `ENVIRONMENT` — `production`\n\n### Resource usage\n\n| Resource | Current | Limit |\n|----------|---------|-------|\n| Workers requests/day | 12,450 | 100,000 |\n| D1 reads/day | 8,230 | 5,000,000 |\n| D1 writes/day | 1,105 | 100,000 |\n| DO requests/day | 6,780 | Unlimited |\n| D1 storage | 2.4 MB | 5 GB |\n\nAll looking healthy. 🚀',
    createdAt: now - 18 * min,
  },
  {
    id: 'do-3',
    agentId: 'devops-agent',
    role: 'user',
    content: 'Check the health endpoint and show me the response',
    createdAt: now - 10 * min,
  },
  {
    id: 'do-4',
    agentId: 'devops-agent',
    role: 'assistant',
    content:
      '```bash\ncurl -s https://agent-home-relay.buzzbeamaustralia.workers.dev/health | jq .\n```\n\n```json\n{\n  "status": "healthy",\n  "version": "1.2.0",\n  "uptime": 86420,\n  "d1": {\n    "connected": true,\n    "latency_ms": 3\n  },\n  "durable_objects": {\n    "active_connections": 2,\n    "total_rooms": 5\n  },\n  "timestamp": "2026-03-30T08:15:00Z"\n}\n```\n\nEverything is **healthy**. D1 latency is `3ms` which is excellent. Currently **2 active WebSocket connections** across **5 rooms**.\n\n> The `uptime` field shows ~24 hours since last cold start — Durable Objects are keeping things warm.',
    createdAt: now - 5 * min,
  },

  // ── Writer conversation (emphasis, all heading levels, blockquotes, links) ──
  {
    id: 'wr-1',
    agentId: 'writer-agent',
    role: 'user',
    content: 'Write a short app store description for Agent Home',
    createdAt: now - 90 * min,
  },
  {
    id: 'wr-2',
    agentId: 'writer-agent',
    role: 'assistant',
    content:
      '# Agent Home\n\n## Your AI agents, one tap away.\n\nChat with AI agents running on your laptop from **anywhere**. Pair instantly with a QR code, get *push notifications* when agents respond, and manage multiple agents from a single interface.\n\n### Key Features\n- 🔗 **Instant pairing** — scan a QR code, done\n- 💬 **Real-time chat** — streamed responses, just like ChatGPT\n- 🔔 **Push notifications** — never miss an agent response\n- 🏠 **Multi-agent dashboard** — all your agents in one place\n- 🔒 **End-to-end secure** — JWT auth, encrypted WebSocket\n\n### Who it\'s for\nDevelopers who run local AI agents (Claude, GPT, custom models) and want ***mobile access*** without the complexity.\n\n> *"Like having a control room for your AI agents in your pocket."*\n\n---\n\n#### Technical Details\n- Built with [Expo](https://expo.dev) and React Native\n- Relay powered by [Cloudflare Workers](https://workers.cloudflare.com)\n- Open protocol — connect any agent via the SDK\n\n##### Requirements\n- iOS 16+ or Android 13+\n- An active bridge or SDK-connected agent\n\n###### Version History\n- **v1.2.0** — Device metadata, improved pairing\n- **v1.1.0** — Push notifications, multi-app support\n- ~~**v1.0.0** — Initial release~~ *(delisted)*',
    createdAt: now - 85 * min,
  },
  {
    id: 'wr-3',
    agentId: 'writer-agent',
    role: 'user',
    content: 'Make it more concise — two sentences max',
    createdAt: now - 80 * min,
  },
  {
    id: 'wr-4',
    agentId: 'writer-agent',
    role: 'assistant',
    content:
      '**Agent Home** lets you chat with AI agents running on your computer from anywhere — pair with a QR code, get push notifications, manage everything from one app. Built for developers who want mobile access to their local AI without the complexity.',
    createdAt: now - 75 * min,
  },

  // ── Data Pipeline conversation (tables, code, structured output) ──
  {
    id: 'dp-1',
    agentId: 'data-agent',
    role: 'user',
    content: 'Show me the latest pipeline run stats',
    createdAt: now - 200 * min,
  },
  {
    id: 'dp-2',
    agentId: 'data-agent',
    role: 'assistant',
    content:
      '## Pipeline Run #847 — Completed ✅\n\n**Started:** 2026-03-30 05:00:00 UTC\n**Finished:** 2026-03-30 05:12:34 UTC\n**Duration:** 12m 34s\n\n### Stage Breakdown\n\n| Stage | Rows In | Rows Out | Duration | Status |\n|-------|---------|----------|----------|--------|\n| Extract (S3) | — | 14,328 | 2m 10s | ✅ |\n| Validate | 14,328 | 14,201 | 1m 45s | ⚠️ |\n| Transform | 14,201 | 14,201 | 5m 22s | ✅ |\n| Load (PostgreSQL) | 14,201 | 14,201 | 3m 17s | ✅ |\n\n### Validation Issues\n\n127 rows rejected during validation:\n\n| Error | Count | Example |\n|-------|-------|---------|\n| Missing `email` field | 83 | Row 4,521 |\n| Invalid `created_at` format | 31 | Row 9,102 |\n| Duplicate `user_id` | 13 | Row 12,887 |\n\nRejected rows written to `s3://buzzbeam-data/rejects/2026-03-30.csv`\n\n---\n\n### Throughput\n- **Extract:** ~110 rows/sec\n- **Transform:** ~44 rows/sec *(bottleneck — geocoding lookups)*\n- **Load:** ~72 rows/sec\n\n> Consider batching geocoding requests to improve transform throughput. Current implementation makes one HTTP call per row.',
    createdAt: now - 195 * min,
  },
  {
    id: 'dp-3',
    agentId: 'data-agent',
    role: 'user',
    content: 'Show me the SQL for the transform stage',
    createdAt: now - 190 * min,
  },
  {
    id: 'dp-4',
    agentId: 'data-agent',
    role: 'assistant',
    content:
      "Here's the core transform query:\n\n```sql\nWITH cleaned AS (\n  SELECT\n    user_id,\n    LOWER(TRIM(email)) AS email,\n    COALESCE(display_name, 'Anonymous') AS display_name,\n    created_at::timestamptz AS created_at,\n    -- Geocode results joined from staging\n    g.country_code,\n    g.city\n  FROM staging.raw_users r\n  LEFT JOIN staging.geocode_cache g\n    ON r.ip_address = g.ip_address\n  WHERE r.batch_id = $1\n    AND r.email IS NOT NULL\n    AND r.created_at IS NOT NULL\n),\ndeduped AS (\n  SELECT DISTINCT ON (user_id) *\n  FROM cleaned\n  ORDER BY user_id, created_at DESC\n)\nINSERT INTO public.users (\n  user_id, email, display_name,\n  created_at, country_code, city\n)\nSELECT * FROM deduped\nON CONFLICT (user_id) DO UPDATE SET\n  email = EXCLUDED.email,\n  display_name = EXCLUDED.display_name,\n  country_code = EXCLUDED.country_code,\n  city = EXCLUDED.city;\n```\n\n### Key points\n- Uses a **CTE chain**: clean → deduplicate → upsert\n- `DISTINCT ON (user_id)` keeps the most recent record per user\n- `ON CONFLICT` does an upsert — no data loss on re-runs\n- Geocode results come from a pre-populated cache table (filled during extract)\n\nThe ~~inline geocoding~~ approach was replaced with cache-based lookups in pipeline v2.1 for better throughput.",
    createdAt: now - 185 * min,
  },
];

export function seedMockData() {
  // Set connection status to connected for mock mode
  useConnectionStore.getState().setStatus('connected');

  // Seed apps and agents into Zustand store
  useAgentsStore.getState().setApps(MOCK_APPS);
  useAgentsStore.getState().setAgents(MOCK_AGENTS);

  // Seed agents into local SQLite (for the chat screen lookups)
  for (const agent of MOCK_AGENTS) {
    db.insert(schema.agents)
      .values({
        id: agent.id,
        name: agent.name,
        description: agent.description ?? null,
        icon: null,
        status: agent.status,
        lastMessage: agent.lastMessage ?? null,
        lastMessageAt: agent.lastMessageAt ?? null,
      })
      .onConflictDoUpdate({
        target: schema.agents.id,
        set: {
          name: agent.name,
          description: agent.description ?? null,
          status: agent.status,
          lastMessage: agent.lastMessage ?? null,
          lastMessageAt: agent.lastMessageAt ?? null,
        },
      })
      .run();
  }

  // Seed messages into local SQLite
  for (const msg of MOCK_MESSAGES) {
    db.insert(schema.messages)
      .values({
        id: msg.id,
        agentId: msg.agentId,
        role: msg.role,
        content: msg.content,
        streaming: 0,
        createdAt: msg.createdAt,
      })
      .onConflictDoNothing()
      .run();
  }
}
