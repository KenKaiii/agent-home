import { create } from 'zustand';

interface StreamingMessage {
  agentId: string;
  content: string;
}

interface MessagesStore {
  streamingMessages: Map<string, StreamingMessage>;
  appendToken: (messageId: string, agentId: string, token: string) => void;
  finalizeMessage: (messageId: string) => string | undefined;
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  streamingMessages: new Map(),
  appendToken: (messageId, agentId, token) =>
    set((state) => {
      const next = new Map(state.streamingMessages);
      const existing = next.get(messageId);
      next.set(messageId, {
        agentId,
        content: existing ? existing.content + token : token,
      });
      return { streamingMessages: next };
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
}));
