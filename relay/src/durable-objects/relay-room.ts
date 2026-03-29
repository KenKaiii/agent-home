import {
  type AgentHeartbeat,
  type AgentListRequest,
  type AgentRegister,
  AgentStatus,
  type AgentUnregister,
  type AgentWithStatus,
  type ChatForward,
  type ChatReceive,
  type ChatSend,
  type ChatStreamEnd,
  type HistoryRequest,
  MessageType,
  RelayMessageSchema,
  type RelayMessage as RelayMessageType,
} from '@agent-home/protocol';
import { DurableObject } from 'cloudflare:workers';

import { getDevicesByType, getHistory, insertMessage } from '../db/index';
import { authenticateUpgrade } from '../lib/auth';
import { sendPushNotification } from '../lib/push';

interface WebSocketAttachment {
  clientId: string;
  clientType: 'app' | 'bridge';
}

interface AgentEntry extends AgentWithStatus {
  bridgeId: string;
}

interface AppEnv {
  DB: D1Database;
  RELAY_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
}

export class RelayRoom extends DurableObject<AppEnv> {
  private agents = new Map<string, AgentEntry>();

  private getWebSocketsByType(type: 'app' | 'bridge'): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => {
      const att = ws.deserializeAttachment() as WebSocketAttachment | null;
      return att?.clientType === type;
    });
  }

  private getAttachment(ws: WebSocket): WebSocketAttachment | null {
    return ws.deserializeAttachment() as WebSocketAttachment | null;
  }

  private broadcastToApps(message: RelayMessageType) {
    const data = JSON.stringify(message);
    for (const ws of this.getWebSocketsByType('app')) {
      try {
        ws.send(data);
      } catch {
        // client may have disconnected
      }
    }
  }

  private sendTo(ws: WebSocket, message: RelayMessageType) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // client may have disconnected
    }
  }

  private findBridgeWebSocket(bridgeId: string): WebSocket | undefined {
    return this.ctx.getWebSockets().find((ws) => {
      const att = this.getAttachment(ws);
      return att?.clientType === 'bridge' && att.clientId === bridgeId;
    });
  }

  private hasConnectedAppClients(): boolean {
    return this.getWebSocketsByType('app').length > 0;
  }

  async fetch(request: Request): Promise<Response> {
    // Internal agent list request (from REST endpoint)
    const url = new URL(request.url);
    if (url.pathname === '/agents') {
      return Response.json({ agents: this.getAgentList() });
    }

    const payload = await authenticateUpgrade(request, this.env.JWT_SECRET);
    if (!payload) {
      return new Response('Unauthorized', { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const attachment: WebSocketAttachment = {
      clientId: payload.clientId,
      clientType: payload.clientType,
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    console.log(`[ws] ${payload.clientType} connected: ${payload.clientId}`);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const att = this.getAttachment(ws);
    if (!att) return;

    try {
      const raw = JSON.parse(
        typeof message === 'string' ? message : new TextDecoder().decode(message),
      );
      const result = RelayMessageSchema.safeParse(raw);
      if (!result.success) {
        console.error('[ws] Invalid message:', result.error.format());
        this.sendTo(ws, {
          id: crypto.randomUUID(),
          type: MessageType.ERROR,
          timestamp: Date.now(),
          code: 'INVALID_MESSAGE',
          message: 'Invalid message format',
        });
        return;
      }
      await this.routeMessage(result.data, att, ws);
    } catch (err) {
      console.error('[ws] Parse error:', err);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const att = this.getAttachment(ws);
    if (!att) return;

    console.log(`[ws] ${att.clientType} disconnected: ${att.clientId}`);

    if (att.clientType === 'bridge') {
      // Mark all agents from this bridge as offline
      for (const [agentId, agent] of this.agents) {
        if (agent.bridgeId === att.clientId) {
          agent.status = AgentStatus.OFFLINE;
          this.broadcastToApps({
            id: crypto.randomUUID(),
            type: MessageType.AGENT_STATUS,
            timestamp: Date.now(),
            agentId,
            status: AgentStatus.OFFLINE,
          });
        }
      }
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    const att = this.getAttachment(ws);
    console.error(`[ws] Error from ${att?.clientId ?? 'unknown'}:`, error);
  }

  private async routeMessage(
    message: RelayMessageType,
    sender: WebSocketAttachment,
    senderWs: WebSocket,
  ) {
    switch (message.type) {
      case MessageType.CHAT_SEND:
        await this.handleChatSend(message as ChatSend, sender);
        break;
      case MessageType.AGENT_REGISTER:
        this.handleAgentRegister(message as AgentRegister, sender);
        break;
      case MessageType.AGENT_UNREGISTER:
        this.handleAgentUnregister(message as AgentUnregister, sender);
        break;
      case MessageType.AGENT_HEARTBEAT:
        this.handleHeartbeat(message as AgentHeartbeat, sender);
        break;
      case MessageType.AGENT_LIST:
        this.handleAgentList(message as AgentListRequest, senderWs);
        break;
      case MessageType.HISTORY_REQUEST:
        await this.handleHistoryRequest(message as HistoryRequest, senderWs);
        break;
      case MessageType.CHAT_STREAM:
        this.broadcastToApps(message);
        break;
      case MessageType.CHAT_STREAM_END:
        await this.persistAssistantMessage(message as ChatStreamEnd);
        this.broadcastToApps(message);
        await this.notifyDisconnectedApps(
          (message as ChatStreamEnd).agentId,
          (message as ChatStreamEnd).content,
        );
        break;
      case MessageType.CHAT_RECEIVE:
        await this.persistAssistantMessage(message as ChatReceive);
        this.broadcastToApps(message);
        await this.notifyDisconnectedApps(
          (message as ChatReceive).agentId,
          (message as ChatReceive).content,
        );
        break;
      default:
        this.sendTo(senderWs, {
          id: crypto.randomUUID(),
          type: MessageType.ERROR,
          timestamp: Date.now(),
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${(message as { type: string }).type}`,
        });
    }
  }

  private async handleChatSend(message: ChatSend, sender: WebSocketAttachment) {
    const agent = this.agents.get(message.agentId);
    if (!agent) return;

    // Persist user message
    try {
      await insertMessage(
        this.env.DB,
        message.id,
        message.agentId,
        'user',
        message.content,
        message.timestamp,
      );
    } catch (err) {
      console.error('[db] Failed to persist user message:', err);
    }

    const bridgeWs = this.findBridgeWebSocket(agent.bridgeId);
    if (!bridgeWs) return;

    const forward: ChatForward = {
      id: crypto.randomUUID(),
      type: MessageType.CHAT_FORWARD,
      timestamp: Date.now(),
      agentId: message.agentId,
      content: message.content,
      userId: sender.clientId,
    };
    this.sendTo(bridgeWs, forward);
  }

  private handleAgentRegister(message: AgentRegister, sender: WebSocketAttachment) {
    const agentInfo = message.agent;
    this.agents.set(agentInfo.id, {
      ...agentInfo,
      status: AgentStatus.ONLINE,
      lastSeen: Date.now(),
      bridgeId: sender.clientId,
    });

    this.broadcastToApps({
      id: crypto.randomUUID(),
      type: MessageType.AGENT_STATUS,
      timestamp: Date.now(),
      agentId: agentInfo.id,
      status: AgentStatus.ONLINE,
    });
  }

  private handleAgentUnregister(message: AgentUnregister, sender: WebSocketAttachment) {
    const agent = this.agents.get(message.agentId);
    if (agent && agent.bridgeId === sender.clientId) {
      agent.status = AgentStatus.OFFLINE;
      this.broadcastToApps({
        id: crypto.randomUUID(),
        type: MessageType.AGENT_STATUS,
        timestamp: Date.now(),
        agentId: message.agentId,
        status: AgentStatus.OFFLINE,
      });
    }
  }

  private handleHeartbeat(message: AgentHeartbeat, sender: WebSocketAttachment) {
    for (const agentId of message.agentIds) {
      const agent = this.agents.get(agentId);
      if (agent && agent.bridgeId === sender.clientId) {
        agent.lastSeen = Date.now();
      }
    }
  }

  private handleAgentList(_message: AgentListRequest, senderWs: WebSocket) {
    this.sendTo(senderWs, {
      id: crypto.randomUUID(),
      type: MessageType.AGENT_LIST_RESPONSE,
      timestamp: Date.now(),
      agents: this.getAgentList(),
    });
  }

  private async handleHistoryRequest(message: HistoryRequest, senderWs: WebSocket) {
    try {
      const limit = message.limit ?? 50;
      const rows = await getHistory(this.env.DB, message.agentId, limit, message.before);

      this.sendTo(senderWs, {
        id: crypto.randomUUID(),
        type: MessageType.HISTORY_RESPONSE,
        timestamp: Date.now(),
        agentId: message.agentId,
        messages: rows.map((r) => ({
          id: r.id,
          role: r.role as 'user' | 'assistant',
          content: r.content,
          createdAt: r.created_at,
        })),
      });
    } catch (err) {
      console.error('[db] Failed to fetch history:', err);
      this.sendTo(senderWs, {
        id: crypto.randomUUID(),
        type: MessageType.HISTORY_RESPONSE,
        timestamp: Date.now(),
        agentId: message.agentId,
        messages: [],
      });
    }
  }

  private async persistAssistantMessage(message: ChatReceive | ChatStreamEnd) {
    try {
      await insertMessage(
        this.env.DB,
        message.messageId,
        message.agentId,
        'assistant',
        message.content,
        message.timestamp,
      );
    } catch (err) {
      console.error('[db] Failed to persist assistant message:', err);
    }
  }

  private async notifyDisconnectedApps(agentId: string, content: string) {
    if (this.hasConnectedAppClients()) return;

    try {
      const devices = await getDevicesByType(this.env.DB, 'app');
      const agentData = this.agents.get(agentId);
      const agentName = agentData?.name ?? agentId;
      const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;

      for (const device of devices) {
        if (device.push_token) {
          await sendPushNotification(device.push_token, agentName, preview, {
            agentId,
          });
        }
      }
    } catch (err) {
      console.error('[push] Failed to notify disconnected apps:', err);
    }
  }

  getAgentList(): AgentWithStatus[] {
    return Array.from(this.agents.values()).map(({ bridgeId: _, ...agent }) => agent);
  }
}
