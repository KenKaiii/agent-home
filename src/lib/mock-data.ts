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
  // Claude Code conversation
  {
    id: 'cc-1',
    agentId: 'claude-code',
    role: 'user',
    content: 'Can you add device metadata to the QR pairing flow?',
    createdAt: now - 30 * min,
  },
  {
    id: 'cc-2',
    agentId: 'claude-code',
    role: 'assistant',
    content:
      "Sure. I'll add `device_name`, `platform`, and `app_version` columns to the devices table, then update the relay endpoints and the app-side calls.\n\nHere's the plan:\n1. D1 migration with `ALTER TABLE` statements\n2. Update `upsertDevice` to accept metadata\n3. Add auth to endpoints\n4. Send metadata from `scan.tsx` after QR pair",
    createdAt: now - 29 * min,
  },
  {
    id: 'cc-3',
    agentId: 'claude-code',
    role: 'user',
    content: 'Sounds good, go ahead.',
    createdAt: now - 28 * min,
  },
  {
    id: 'cc-4',
    agentId: 'claude-code',
    role: 'assistant',
    content:
      "All done. Here's what changed:\n\n```sql\nALTER TABLE devices ADD COLUMN device_name TEXT;\nALTER TABLE devices ADD COLUMN platform TEXT;\nALTER TABLE devices ADD COLUMN app_version TEXT;\n```\n\nBoth `POST /devices/register` and `GET /devices` now require Bearer auth. Platform is validated against `['ios', 'android', 'web']`.\n\nDeployed to production.",
    createdAt: now - 25 * min,
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
      'Done — deployed to production. Push tokens are now validated with a regex: `ExponentPushToken[...]` format required. Invalid tokens get a 400 response.',
    createdAt: now - 2 * min,
  },

  // Research Agent conversation
  {
    id: 'ra-1',
    agentId: 'research-agent',
    role: 'user',
    content: 'Compare WebSocket vs SSE for real-time mobile apps',
    createdAt: now - 60 * min,
  },
  {
    id: 'ra-2',
    agentId: 'research-agent',
    role: 'assistant',
    content:
      '## WebSocket vs SSE for Mobile\n\n**WebSocket** is bidirectional — ideal when the client needs to send frequent messages (chat, commands). Battery impact is higher due to persistent connections.\n\n**SSE** is server-push only over HTTP — simpler, auto-reconnects, and works through HTTP/2 multiplexing. Better for one-way feeds (notifications, dashboards).\n\n### Recommendation\nFor a chat app with agent interactions: **WebSocket**. You need bidirectional communication for sending messages and receiving streamed responses.\n\n> SSE would work for a read-only agent dashboard but not for interactive chat.',
    createdAt: now - 55 * min,
  },
  {
    id: 'ra-3',
    agentId: 'research-agent',
    role: 'user',
    content: 'What about connection reliability on mobile networks?',
    createdAt: now - 50 * min,
  },
  {
    id: 'ra-4',
    agentId: 'research-agent',
    role: 'assistant',
    content:
      "Mobile networks are inherently unstable — connections drop during cell tower handoffs, Wi-Fi transitions, and backgrounding.\n\n**Key patterns to implement:**\n- Exponential backoff on reconnect (you're already doing this: 1s → 2s → 4s → 30s cap)\n- Message queue that flushes after reconnect\n- Heartbeat/ping to detect stale connections\n- Store messages locally (SQLite) so nothing is lost\n\nYour current architecture handles all of these well.",
    createdAt: now - 45 * min,
  },

  // DevOps Agent conversation
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
      'Running `wrangler deploy`...\n\n```\n✓ Built successfully\n✓ Uploaded worker (2.1s)\n✓ Published agent-home-relay\n  https://agent-home-relay.buzzbeamaustralia.workers.dev\n```\n\nDeployment successful. D1 migrations are up to date.',
    createdAt: now - 18 * min,
  },
  {
    id: 'do-3',
    agentId: 'devops-agent',
    role: 'user',
    content: 'Check the health endpoint',
    createdAt: now - 10 * min,
  },
  {
    id: 'do-4',
    agentId: 'devops-agent',
    role: 'assistant',
    content: 'Running terraform plan now...',
    createdAt: now - 5 * min,
  },

  // Writer conversation
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
      '**Agent Home** — Your AI agents, one tap away.\n\nChat with AI agents running on your laptop from anywhere. Pair instantly with a QR code, get push notifications when agents respond, and manage multiple agents from a single interface.\n\nBuilt for developers who run local AI agents and want mobile access without the complexity.',
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
    content: 'Draft ready for review.',
    createdAt: now - 45 * min,
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
        lastMessageAt: agent.lastMessageAt ?? null,
      })
      .onConflictDoUpdate({
        target: schema.agents.id,
        set: {
          name: agent.name,
          description: agent.description ?? null,
          status: agent.status,
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
