import { useMemo } from 'react';

import { useAgentsStore } from '@/stores/agents';
import type { Agent } from '@/types';

export function useAgents() {
  const agentMap = useAgentsStore((s) => s.agents);

  const agents = useMemo(() => {
    const list = Array.from(agentMap.values());
    list.sort((a, b) => {
      // Online first, then by name
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (a.status !== 'online' && b.status === 'online') return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [agentMap]);

  return { agents };
}
