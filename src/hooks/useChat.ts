import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MessageType } from '@agent-home/protocol';
import type { ChatReceive, ChatStreamEnd, HistoryResponse } from '@agent-home/protocol';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { db, schema } from '@/db';
import { relayClient } from '@/lib/websocket';
import { useMessagesStore } from '@/stores/messages';
import type { ChatMessage } from '@/types';

const nanoid = () =>
  'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

export function useChat(agentId: string, sessionId?: string, isNewChat: boolean = false) {
  const [dbMessages, setDbMessages] = useState<ChatMessage[]>([]);
  // For new chats, activeSessionId starts undefined and gets adopted from the agent's first response
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(sessionId);
  const sentMessageIds = useRef<Set<string>>(new Set());
  const streamingMessages = useMessagesStore((s) => s.streamingMessages);

  // Sync activeSessionId if sessionId prop changes (navigating between sessions)
  useEffect(() => {
    if (!isNewChat) {
      setActiveSessionId(sessionId);
    }
  }, [sessionId, isNewChat]);

  // Load messages from local DB filtered by activeSessionId
  const loadMessages = useCallback(() => {
    const sessionFilter = activeSessionId
      ? eq(schema.messages.sessionId, activeSessionId)
      : isNull(schema.messages.sessionId);

    const rows = db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.agentId, agentId), sessionFilter))
      .orderBy(desc(schema.messages.createdAt))
      .limit(100)
      .all()
      .reverse();

    setDbMessages(
      rows.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        role: r.role as 'user' | 'assistant',
        content: r.content,
        streaming: r.streaming === 1,
        createdAt: r.createdAt,
      })),
    );
  }, [agentId, activeSessionId]);

  useEffect(() => {
    // New chat starts empty — don't load old messages or request history
    if (!isNewChat || activeSessionId) {
      loadMessages();
    }

    // Request history from relay (skip for brand-new chats with no session yet)
    if (!isNewChat && relayClient.isConnected) {
      relayClient.send({
        id: nanoid(),
        type: MessageType.HISTORY_REQUEST,
        timestamp: Date.now(),
        agentId,
        limit: 50,
        ...(activeSessionId ? { sessionId: activeSessionId } : {}),
      });
    }

    // Re-load when streaming ends — check sessionId matches
    const unsub = relayClient.on(MessageType.CHAT_STREAM_END, (msg) => {
      const streamEnd = msg as ChatStreamEnd;
      if (streamEnd.agentId !== agentId) return;

      // If we're a new chat waiting for a session, adopt the agent's sessionId
      if (isNewChat && streamEnd.sessionId && !activeSessionId) {
        // Migrate our sent messages to the new sessionId
        for (const id of sentMessageIds.current) {
          db.update(schema.messages)
            .set({ sessionId: streamEnd.sessionId })
            .where(eq(schema.messages.id, id))
            .run();
        }
        setActiveSessionId(streamEnd.sessionId);
        return; // state change will trigger reload via the effect
      }

      // Only reload if sessionId matches our active session
      const msgSession = streamEnd.sessionId ?? undefined;
      if (msgSession === activeSessionId) {
        loadMessages();
      }
    });

    const unsub2 = relayClient.on(MessageType.CHAT_RECEIVE, (msg) => {
      const receive = msg as ChatReceive;
      if (receive.agentId !== agentId) return;

      // If we're a new chat waiting for a session, adopt the agent's sessionId
      if (isNewChat && receive.sessionId && !activeSessionId) {
        for (const id of sentMessageIds.current) {
          db.update(schema.messages)
            .set({ sessionId: receive.sessionId })
            .where(eq(schema.messages.id, id))
            .run();
        }
        setActiveSessionId(receive.sessionId);
        return;
      }

      const msgSession = receive.sessionId ?? undefined;
      if (msgSession === activeSessionId) {
        loadMessages();
      }
    });

    // Handle history response — save to local DB then reload
    const unsub3 = relayClient.on(MessageType.HISTORY_RESPONSE, (msg) => {
      const resp = msg as HistoryResponse;
      if (resp.agentId !== agentId) return;
      if ((resp.sessionId ?? undefined) !== activeSessionId) return;

      for (const m of resp.messages) {
        db.insert(schema.messages)
          .values({
            id: m.id,
            agentId,
            role: m.role,
            content: m.content,
            streaming: 0,
            createdAt: m.createdAt,
            sessionId: resp.sessionId ?? null,
          })
          .onConflictDoUpdate({
            target: schema.messages.id,
            set: { sessionId: resp.sessionId ?? null },
          })
          .run();
      }
      loadMessages();
    });

    return () => {
      unsub();
      unsub2();
      unsub3();
    };
  }, [agentId, activeSessionId, isNewChat, loadMessages]);

  // Merge DB messages with in-flight streaming
  const messages = useMemo(() => {
    const result = [...dbMessages];

    for (const [messageId, streaming] of streamingMessages) {
      if (streaming.agentId === agentId) {
        result.push({
          id: messageId,
          agentId,
          role: 'assistant',
          content: streaming.content,
          streaming: true,
          createdAt: Date.now(),
        });
      }
    }

    return result;
  }, [dbMessages, streamingMessages, agentId]);

  const isStreaming = useMemo(() => {
    for (const [, streaming] of streamingMessages) {
      if (streaming.agentId === agentId) return true;
    }
    return false;
  }, [streamingMessages, agentId]);

  const sendMessage = useCallback(
    (text: string) => {
      const id = nanoid();
      const now = Date.now();

      // Track sent message IDs so we can migrate them when a session is adopted
      sentMessageIds.current.add(id);

      // Save locally immediately (optimistic)
      db.insert(schema.messages)
        .values({
          id,
          agentId,
          role: 'user',
          content: text,
          streaming: 0,
          createdAt: now,
          sessionId: activeSessionId ?? null,
        })
        .run();

      // Update last message preview and time for the agent
      db.update(schema.agents)
        .set({ lastMessage: text, lastMessageAt: now })
        .where(eq(schema.agents.id, agentId))
        .run();

      // Send via WS
      relayClient.send({
        id,
        type: MessageType.CHAT_SEND,
        timestamp: now,
        agentId,
        content: text,
        ...(activeSessionId ? { sessionId: activeSessionId } : {}),
      });

      // For new chats, show the sent message immediately even though loadMessages
      // filters by activeSessionId (which is still undefined)
      if (isNewChat && !activeSessionId) {
        setDbMessages((prev) => [
          ...prev,
          { id, agentId, role: 'user', content: text, streaming: false, createdAt: now },
        ]);
      } else {
        loadMessages();
      }
    },
    [agentId, activeSessionId, isNewChat, loadMessages],
  );

  return { messages, sendMessage, isStreaming };
}
