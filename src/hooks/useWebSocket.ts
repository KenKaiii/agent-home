import { useEffect, useRef } from 'react';

import { MessageType } from '@agent-home/protocol';
import type {
  AgentListResponse,
  AgentStatusMessage,
  ChatReceive,
  ChatStream,
  ChatStreamEnd,
  HistoryResponse,
} from '@agent-home/protocol';
import NetInfo from '@react-native-community/netinfo';
import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { relayClient } from '@/lib/websocket';
import { useAgentsStore } from '@/stores/agents';
import { useConnectionStore } from '@/stores/connection';
import { useMessagesStore } from '@/stores/messages';
import type { Agent } from '@/types';

const nanoid = () => crypto.randomUUID();

const USE_MOCK_DATA = __DEV__;

export function useWebSocket(ready: boolean = false) {
  const { relayUrl, token, setStatus } = useConnectionStore();
  const { setAgents, updateStatus } = useAgentsStore();
  const { appendToken, finalizeMessage } = useMessagesStore();
  const connectedRef = useRef(false);
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (USE_MOCK_DATA) return;
    if (!ready || !token || connectedRef.current) return;
    connectedRef.current = true;

    setStatus('connecting');
    relayClient.connect(relayUrl, token);

    // --- Agent list + connection state tracking ---
    const unsubAgentList = relayClient.on(MessageType.AGENT_LIST_RESPONSE, (msg) => {
      setStatus('connected');

      // On reconnect, request missed messages for all known agents
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        requestMissedMessages();
      }

      const { agents } = msg as AgentListResponse;

      // Look up persisted lastMessage values from local DB
      const existingRows = db.select().from(schema.agents).all();
      const lastMessageByAgentId = new Map(
        existingRows.map((r) => [
          r.id,
          { lastMessage: r.lastMessage, lastMessageAt: r.lastMessageAt },
        ]),
      );

      const mapped: Agent[] = agents.map((a) => {
        const persisted = lastMessageByAgentId.get(a.id);
        return {
          id: a.id,
          appId: '',
          name: a.name,
          description: a.description,
          icon: a.icon,
          status: a.status,
          lastMessage: persisted?.lastMessage ?? undefined,
          lastMessageAt: persisted?.lastMessageAt ?? undefined,
        };
      });
      setAgents(mapped);

      // Sync to local DB (preserve lastMessage/lastMessageAt — do not overwrite)
      for (const agent of mapped) {
        db.insert(schema.agents)
          .values({
            id: agent.id,
            name: agent.name,
            description: agent.description ?? null,
            icon: agent.icon ?? null,
            status: agent.status,
            lastMessage: agent.lastMessage ?? null,
            lastMessageAt: agent.lastMessageAt ?? null,
          })
          .onConflictDoUpdate({
            target: schema.agents.id,
            set: {
              name: agent.name,
              description: agent.description ?? null,
              icon: agent.icon ?? null,
              status: agent.status,
            },
          })
          .run();
      }
    });

    // --- Agent status changes ---
    const unsubStatus = relayClient.on(MessageType.AGENT_STATUS, (msg) => {
      const { agentId, status } = msg as AgentStatusMessage;
      updateStatus(agentId, status);

      db.update(schema.agents).set({ status }).where(eq(schema.agents.id, agentId)).run();

      // If this is a new online agent not yet in the store, request the full agent list
      if (status === 'online' && !useAgentsStore.getState().agents.has(agentId)) {
        relayClient.send({
          id: nanoid(),
          type: MessageType.AGENT_LIST,
          timestamp: Date.now(),
        });
      }
    });

    // --- Streaming tokens ---
    const unsubStream = relayClient.on(MessageType.CHAT_STREAM, (msg) => {
      const { messageId, agentId, token: tkn } = msg as ChatStream;
      appendToken(messageId, agentId, tkn);
    });

    // --- Stream end ---
    const unsubStreamEnd = relayClient.on(MessageType.CHAT_STREAM_END, (msg) => {
      const { messageId, agentId, content } = msg as ChatStreamEnd;
      finalizeMessage(messageId);

      db.insert(schema.messages)
        .values({
          id: messageId,
          agentId,
          role: 'assistant',
          content,
          streaming: 0,
          createdAt: msg.timestamp,
        })
        .onConflictDoNothing()
        .run();

      db.update(schema.agents)
        .set({ lastMessage: content, lastMessageAt: msg.timestamp })
        .where(eq(schema.agents.id, agentId))
        .run();

      const agentForStreamEnd = useAgentsStore.getState().agents.get(agentId);
      if (agentForStreamEnd) {
        useAgentsStore.getState().updateAgent({
          ...agentForStreamEnd,
          lastMessage: content,
          lastMessageAt: msg.timestamp,
        });
      }
    });

    // --- Complete messages ---
    const unsubReceive = relayClient.on(MessageType.CHAT_RECEIVE, (msg) => {
      const { messageId, agentId, content } = msg as ChatReceive;

      db.insert(schema.messages)
        .values({
          id: messageId,
          agentId,
          role: 'assistant',
          content,
          streaming: 0,
          createdAt: msg.timestamp,
        })
        .onConflictDoNothing()
        .run();

      db.update(schema.agents)
        .set({ lastMessage: content, lastMessageAt: msg.timestamp })
        .where(eq(schema.agents.id, agentId))
        .run();

      const agentForReceive = useAgentsStore.getState().agents.get(agentId);
      if (agentForReceive) {
        useAgentsStore.getState().updateAgent({
          ...agentForReceive,
          lastMessage: content,
          lastMessageAt: msg.timestamp,
        });
      }
    });

    // --- History response ---
    const unsubHistory = relayClient.on(MessageType.HISTORY_RESPONSE, (msg) => {
      const { agentId, messages: historyMessages } = msg as HistoryResponse;
      for (const m of historyMessages) {
        db.insert(schema.messages)
          .values({
            id: m.id,
            agentId,
            role: m.role,
            content: m.content,
            streaming: 0,
            createdAt: m.createdAt,
          })
          .onConflictDoNothing()
          .run();
      }
    });

    // --- Error handling ---
    const unsubError = relayClient.on(MessageType.ERROR, (msg) => {
      const message =
        'message' in msg ? (msg as { message: string }).message : 'Unknown server error';
      console.error('[ws] Server error:', message);
      useConnectionStore.getState().setError(message);
    });

    // --- NetInfo: reconnect on network recovery ---
    const unsubNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && !relayClient.isConnected) {
        console.log('[ws] Network recovered, reconnecting...');
        wasDisconnectedRef.current = true;
        setStatus('connecting');
        relayClient.connect(relayUrl, token);
      } else if (!state.isConnected) {
        wasDisconnectedRef.current = true;
        setStatus('disconnected');
      }
    });

    return () => {
      unsubAgentList();
      unsubStatus();
      unsubStream();
      unsubStreamEnd();
      unsubReceive();
      unsubHistory();
      unsubError();
      unsubNetInfo();
      relayClient.disconnect();
      connectedRef.current = false;
      setStatus('disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store selectors are stable refs
  }, [ready, token, relayUrl]);
}

/** Request recent history for all known agents after reconnect */
function requestMissedMessages() {
  try {
    const agentRows = db.select().from(schema.agents).all();
    for (const agent of agentRows) {
      relayClient.send({
        id: nanoid(),
        type: MessageType.HISTORY_REQUEST,
        timestamp: Date.now(),
        agentId: agent.id,
        limit: 20,
      });
    }
  } catch (err) {
    console.error('[ws] Failed to request missed messages:', err);
  }
}
