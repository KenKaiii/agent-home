import { create } from 'zustand';

interface StreamingMessage {
  agentId: string;
  tokens: string[];
}

interface MessagesStore {
  streamingMessages: Map<string, StreamingMessage>;
  appendToken: (messageId: string, agentId: string, token: string) => void;
  finalizeMessage: (messageId: string) => string | undefined;
  getStreamingContent: (messageId: string) => string;
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  streamingMessages: new Map(),
  appendToken: (messageId, agentId, token) =>
    set((state) => {
      const streamingMessages = new Map(state.streamingMessages);
      const existing = streamingMessages.get(messageId);
      if (existing) {
        streamingMessages.set(messageId, {
          ...existing,
          tokens: [...existing.tokens, token],
        });
      } else {
        streamingMessages.set(messageId, { agentId, tokens: [token] });
      }
      return { streamingMessages };
    }),
  finalizeMessage: (messageId) => {
    const msg = get().streamingMessages.get(messageId);
    const content = msg?.tokens.join('');
    set((state) => {
      const streamingMessages = new Map(state.streamingMessages);
      streamingMessages.delete(messageId);
      return { streamingMessages };
    });
    return content;
  },
  getStreamingContent: (messageId) => {
    const msg = get().streamingMessages.get(messageId);
    return msg?.tokens.join('') ?? '';
  },
}));
