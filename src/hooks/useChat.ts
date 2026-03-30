import { useCallback, useEffect, useMemo, useState } from 'react';

import { MessageType } from '@agent-home/protocol';
import { desc, eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { relayClient } from '@/lib/websocket';
import { useMessagesStore } from '@/stores/messages';
import type { ChatMessage } from '@/types';

const nanoid = () => crypto.randomUUID();

export function useChat(agentId: string) {
  const [dbMessages, setDbMessages] = useState<ChatMessage[]>([]);
  const streamingMessages = useMessagesStore((s) => s.streamingMessages);

  // Load messages from local DB
  const loadMessages = useCallback(() => {
    const rows = db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.agentId, agentId))
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
  }, [agentId]);

  useEffect(() => {
    loadMessages();

    // Re-load when streaming ends (new message saved)
    const unsub = relayClient.on(MessageType.CHAT_STREAM_END, (msg) => {
      if ('agentId' in msg && msg.agentId === agentId) {
        loadMessages();
      }
    });
    const unsub2 = relayClient.on(MessageType.CHAT_RECEIVE, (msg) => {
      if ('agentId' in msg && msg.agentId === agentId) {
        loadMessages();
      }
    });
    const unsub3 = relayClient.on(MessageType.HISTORY_RESPONSE, (msg) => {
      if ('agentId' in msg && msg.agentId === agentId) {
        loadMessages();
      }
    });

    return () => {
      unsub();
      unsub2();
      unsub3();
    };
  }, [agentId, loadMessages]);

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

      // Save locally immediately (optimistic)
      db.insert(schema.messages)
        .values({
          id,
          agentId,
          role: 'user',
          content: text,
          streaming: 0,
          createdAt: now,
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
      });

      loadMessages();
    },
    [agentId, loadMessages],
  );

  return { messages, sendMessage, isStreaming };
}
