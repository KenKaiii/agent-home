import { useEffect, useRef } from 'react';

import { MessageType } from '@agent-home/protocol';
import type {
  AgentListResponse,
  AgentStatusMessage,
  ChatReceive,
  ChatStream,
  ChatStreamEnd,
} from '@agent-home/protocol';
import NetInfo from '@react-native-community/netinfo';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid/non-secure';

import { db, schema } from '@/db';
import { relayClient } from '@/lib/websocket';
import { useAgentsStore } from '@/stores/agents';
import { useConnectionStore } from '@/stores/connection';
import { useMessagesStore } from '@/stores/messages';
import type { Agent } from '@/types';

export function useWebSocket() {
  const { relayUrl, token, setStatus } = useConnectionStore();
  const { setAgents, updateStatus } = useAgentsStore();
  const { appendToken, finalizeMessage } = useMessagesStore();
  const connectedRef = useRef(false);
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (!token || connectedRef.current) return;
    connectedRef.current = true;

    setStatus('connecting');
    relayClient.connect(relayUrl, token);

    // --- Connection state tracking ---
    const unsubOpen = relayClient.on(MessageType.AGENT_LIST_RESPONSE, () => {
      setStatus('connected');

      // On reconnect, request missed messages for all known agents
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        requestMissedMessages();
      }
    });

    // --- Agent list ---
    const unsubAgentList = relayClient.on(MessageType.AGENT_LIST_RESPONSE, (msg) => {
      const { agents } = msg as AgentListResponse;
      const mapped: Agent[] = agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        status: a.status,
      }));
      setAgents(mapped);

      // Sync to local DB
      for (const agent of mapped) {
        db.insert(schema.agents)
          .values({
            id: agent.id,
            name: agent.name,
            description: agent.description ?? null,
            icon: agent.icon ?? null,
            status: agent.status,
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
    });

    // --- Error handling ---
    const unsubError = relayClient.on(MessageType.ERROR, (msg) => {
      if ('message' in msg) {
        console.error('[ws] Server error:', (msg as { message: string }).message);
      }
    });

    // --- NetInfo: reconnect on network recovery ---
    const unsubNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && !relayClient.isConnected) {
        console.log('[ws] Network recovered, reconnecting...');
        wasDisconnectedRef.current = true;
        setStatus('connecting');
        relayClient.disconnect();
        relayClient.connect(relayUrl, token);
      } else if (!state.isConnected) {
        wasDisconnectedRef.current = true;
        setStatus('disconnected');
      }
    });

    return () => {
      unsubOpen();
      unsubAgentList();
      unsubStatus();
      unsubStream();
      unsubStreamEnd();
      unsubReceive();
      unsubError();
      unsubNetInfo();
      relayClient.disconnect();
      connectedRef.current = false;
      setStatus('disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store selectors are stable refs
  }, [token, relayUrl]);
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
