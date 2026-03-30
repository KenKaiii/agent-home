import { create } from 'zustand';

interface StreamingMessage {
  agentId: string;
  content: string;
}

interface MessagesStore {
  streamingMessages: Map<string, StreamingMessage>;
  /** agentIds we're waiting on a response from (sent message, no reply yet) */
  waitingAgents: Set<string>;
  appendToken: (messageId: string, agentId: string, token: string) => void;
  finalizeMessage: (messageId: string) => string | undefined;
  setWaiting: (agentId: string) => void;
  clearWaiting: (agentId: string) => void;
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  streamingMessages: new Map(),
  waitingAgents: new Set(),
  appendToken: (messageId, agentId, token) =>
    set((state) => {
      const next = new Map(state.streamingMessages);
      const existing = next.get(messageId);
      next.set(messageId, {
        agentId,
        content: existing ? existing.content + token : token,
      });
      // First token arrived — no longer "waiting"
      const nextWaiting = new Set(state.waitingAgents);
      nextWaiting.delete(agentId);
      return { streamingMessages: next, waitingAgents: nextWaiting };
    }),
  finalizeMessage: (messageId) => {
    const msg = get().streamingMessages.get(messageId);
    const content = msg?.content;
    set((state) => {
      const streamingMessages = new Map(state.streamingMessages);
      streamingMessages.delete(messageId);
      return { streamingMessages };
    });
    return content;
  },
  setWaiting: (agentId) =>
    set((state) => {
      const nextWaiting = new Set(state.waitingAgents);
      nextWaiting.add(agentId);
      return { waitingAgents: nextWaiting };
    }),
  clearWaiting: (agentId) =>
    set((state) => {
      const nextWaiting = new Set(state.waitingAgents);
      nextWaiting.delete(agentId);
      return { waitingAgents: nextWaiting };
    }),
}));
