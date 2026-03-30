import { create } from 'zustand';

import type { Agent, ConnectedApp } from '@/types';

interface AgentsStore {
  agents: Map<string, Agent>;
  apps: Map<string, ConnectedApp>;
  updateAgent: (agent: Agent) => void;
  setAgents: (agents: Agent[]) => void;
  setApps: (apps: ConnectedApp[]) => void;
  updateStatus: (agentId: string, status: Agent['status']) => void;
}

export const useAgentsStore = create<AgentsStore>((set) => ({
  agents: new Map(),
  apps: new Map(),
  updateAgent: (agent) =>
    set((state) => {
      const agents = new Map(state.agents);
      agents.set(agent.id, agent);
      return { agents };
    }),
  setAgents: (agentList) =>
    set(() => {
      const agents = new Map<string, Agent>();
      for (const agent of agentList) {
        agents.set(agent.id, agent);
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
}));
