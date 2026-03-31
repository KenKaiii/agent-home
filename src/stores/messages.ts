import { create } from 'zustand';

const FLUSH_INTERVAL_MS = 80;

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

// Token buffer — accumulates tokens between flushes to avoid per-token re-renders
const tokenBuffer = new Map<string, { agentId: string; tokens: string }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushTokenBuffer() {
  flushTimer = null;
  if (tokenBuffer.size === 0) return;

  const buffered = new Map(tokenBuffer);
  tokenBuffer.clear();

  useMessagesStore.setState((state) => {
    const next = new Map(state.streamingMessages);
    const nextWaiting = new Set(state.waitingAgents);

    for (const [messageId, { agentId, tokens }] of buffered) {
      const existing = next.get(messageId);
      next.set(messageId, {
        agentId,
        content: existing ? existing.content + tokens : tokens,
      });
      nextWaiting.delete(agentId);
    }

    return { streamingMessages: next, waitingAgents: nextWaiting };
  });
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  streamingMessages: new Map(),
  waitingAgents: new Set(),
  appendToken: (messageId, agentId, token) => {
    const existing = tokenBuffer.get(messageId);
    tokenBuffer.set(messageId, {
      agentId,
      tokens: existing ? existing.tokens + token : token,
    });

    if (!flushTimer) {
      flushTimer = setTimeout(flushTokenBuffer, FLUSH_INTERVAL_MS);
    }
  },
  finalizeMessage: (messageId) => {
    // Flush any remaining buffered tokens for this message before finalizing
    const buffered = tokenBuffer.get(messageId);
    tokenBuffer.delete(messageId);

    const existing = get().streamingMessages.get(messageId);
    const content = buffered
      ? (existing ? existing.content : '') + buffered.tokens
      : existing?.content;

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
