import { create } from 'zustand';

import type { Agent } from '@/types';

interface AgentsStore {
  agents: Map<string, Agent>;
  updateAgent: (agent: Agent) => void;
  setAgents: (agents: Agent[]) => void;
  updateStatus: (agentId: string, status: Agent['status']) => void;
  removeAgent: (id: string) => void;
}

export const useAgentsStore = create<AgentsStore>((set) => ({
  agents: new Map(),
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
  updateStatus: (agentId, status) =>
    set((state) => {
      const agents = new Map(state.agents);
      const agent = agents.get(agentId);
      if (agent) {
        agents.set(agentId, { ...agent, status });
      }
      return { agents };
    }),
  removeAgent: (id) =>
    set((state) => {
      const agents = new Map(state.agents);
      agents.delete(id);
      return { agents };
    }),
}));
