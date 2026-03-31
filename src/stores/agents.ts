import { create } from 'zustand';

import { db, schema } from '@/db';
import type { Agent, AgentSession, ConnectedApp } from '@/types';

interface AgentsStore {
  agents: Map<string, Agent>;
  apps: Map<string, ConnectedApp>;
  /** Session IDs the user has locally deleted — filtered out from relay updates */
  deletedSessionIds: Set<string>;
  updateAgent: (agent: Agent) => void;
  setAgents: (agents: Agent[]) => void;
  setApps: (apps: ConnectedApp[]) => void;
  updateStatus: (agentId: string, status: Agent['status']) => void;
  updateSessions: (agentId: string, sessions: AgentSession[]) => void;
  removeSession: (agentId: string, sessionId: string) => void;
}

/** Load persisted deleted session IDs from SQLite */
function loadDeletedSessionIds(): Set<string> {
  try {
    const rows = db.select().from(schema.deletedSessions).all();
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

function filterDeletedSessions(
  sessions: AgentSession[] | undefined,
  deletedIds: Set<string>,
): AgentSession[] | undefined {
  if (!sessions || deletedIds.size === 0) return sessions;
  return sessions.filter((s) => !deletedIds.has(s.id));
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  agents: new Map(),
  apps: new Map(),
  deletedSessionIds: loadDeletedSessionIds(),
  updateAgent: (agent) =>
    set((state) => {
      const agents = new Map(state.agents);
      agents.set(agent.id, {
        ...agent,
        sessions: filterDeletedSessions(agent.sessions, state.deletedSessionIds),
      });
      return { agents };
    }),
  setAgents: (agentList) =>
    set((state) => {
      const agents = new Map<string, Agent>();
      for (const agent of agentList) {
        agents.set(agent.id, {
          ...agent,
          sessions: filterDeletedSessions(agent.sessions, state.deletedSessionIds),
        });
      }
      return { agents };
    }),
  setApps: (appList) =>
    set(() => {
      const apps = new Map<string, ConnectedApp>();
      for (const app of appList) {
        apps.set(app.id, app);
      }
      return { apps };
    }),
  updateStatus: (agentId, status) =>
    set((state) => {
      const agents = new Map(state.agents);
      const agent = agents.get(agentId);
      if (agent) {
        agents.set(agentId, { ...agent, status });
      }
      return { agents };
    }),
  updateSessions: (agentId, sessions) =>
    set((state) => {
      const agents = new Map(state.agents);
      const agent = agents.get(agentId);
      if (agent) {
        const filtered = filterDeletedSessions(sessions, state.deletedSessionIds);
        agents.set(agentId, { ...agent, sessions: filtered });
      }
      return { agents };
    }),
  removeSession: (agentId, sessionId) =>
    set((state) => {
      const agents = new Map(state.agents);
      const deletedSessionIds = new Set(state.deletedSessionIds);
      deletedSessionIds.add(sessionId);
      const agent = agents.get(agentId);
      if (agent?.sessions) {
        agents.set(agentId, {
          ...agent,
          sessions: agent.sessions.filter((s) => s.id !== sessionId),
        });
      }

      // Persist to SQLite so deletions survive app restarts
      try {
        db.insert(schema.deletedSessions)
          .values({ id: sessionId, deletedAt: Date.now() })
          .onConflictDoNothing()
          .run();
      } catch {
        // Best-effort persistence
      }

      return { agents, deletedSessionIds };
    }),
}));
