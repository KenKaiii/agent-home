import {
  type AgentHeartbeat,
  type AgentListRequest,
  type AgentRegister,
  type AgentSession,
  AgentStatus,
  type AgentUnregister,
  type AgentWithStatus,
  type ChatForward,
  type ChatReceive,
  type ChatSend,
  type ChatStream,
  type ChatStreamEnd,
  type HistoryRequest,
  MessageType,
  RelayMessageSchema,
  type RelayMessage as RelayMessageType,
  type SessionDelete,
  type SessionsUpdate,
} from '@agent-home/protocol';
import { DurableObject } from 'cloudflare:workers';

import {
  adoptOrphanedUserMessages,
  deleteSessionMessages,
  getDevicesByType,
  getHistory,
  insertMessage,
} from '../db/index';
import { sendPushNotification } from '../lib/push';
import { verifyToken } from '../lib/token';

interface WebSocketAttachment {
  clientId: string;
  clientType: 'app' | 'bridge';
  authenticated: boolean;
  connectedAt: number;
}

interface AgentEntry extends AgentWithStatus {
  bridgeId: string;
  sessions?: AgentSession[];
}

interface AppEnv {
  DB: D1Database;
  RELAY_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
}

export class RelayRoom extends DurableObject<AppEnv> {
  private agents = new Map<string, AgentEntry>();
  private logs: string[] = [];
  /** Tracks user message IDs sent without a sessionId, keyed by agentId */
  private pendingUserMessages = new Map<string, Set<string>>();

  private log(msg: string) {
    const entry = `${new Date().toISOString()} ${msg}`;
    this.logs.push(entry);
    if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200);
    console.log(msg);
  }

  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
    // Restore agents from storage on wakeup. WebSocket connections survive hibernation
    // (CF Hibernation API keeps sockets open), so we preserve the persisted status.
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<AgentEntry[]>('agents');
      if (stored) {
        for (const agent of stored) {
          this.agents.set(agent.id, agent);
        }
      }
    });
  }

  private async persistAgents(): Promise<void> {
    await this.ctx.storage.put('agents', Array.from(this.agents.values()));
  }

  private getWebSocketsByType(type: 'app' | 'bridge'): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => {
      const att = ws.deserializeAttachment() as WebSocketAttachment | null;
      return att?.authenticated && att.clientType === type;
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
      return att?.authenticated && att.clientType === 'bridge' && att.clientId === bridgeId;
    });
  }

  private hasConnectedAppClients(): boolean {
    return this.getWebSocketsByType('app').length > 0;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal agent list request (from REST endpoint)
    if (url.pathname === '/agents') {
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const payload = token ? await verifyToken(token, this.env.JWT_SECRET) : null;
      if (!payload) return new Response('Unauthorized', { status: 401 });
      return Response.json({ agents: this.getAgentList() });
    }

    // Logs endpoint — in-memory ring buffer of recent events
    if (url.pathname === '/logs') {
      return Response.json({ logs: this.logs });
    }

    // Debug endpoint — shows full relay state
    if (url.pathname === '/debug') {
      const allSockets = this.ctx.getWebSockets();
      const clients = allSockets.map((ws) => {
        const att = this.getAttachment(ws);
        return {
          clientId: att?.clientId ?? '(unknown)',
          clientType: att?.clientType ?? '(unknown)',
          authenticated: att?.authenticated ?? false,
          connectedAt: att?.connectedAt ?? 0,
          readyState: ws.readyState,
        };
      });

      const agents = Array.from(this.agents.entries()).map(([id, agent]) => ({
        id,
        name: agent.name,
        status: agent.status,
        bridgeId: agent.bridgeId,
        lastSeen: agent.lastSeen,
      }));

      return Response.json({
        timestamp: Date.now(),
        totalSockets: allSockets.length,
        appClients: clients.filter((c) => c.clientType === 'app').length,
        bridgeClients: clients.filter((c) => c.clientType === 'bridge').length,
        unauthenticated: clients.filter((c) => !c.authenticated).length,
        clients,
        agents,
        agentCount: agents.length,
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept tentatively — auth happens on the first message
    const attachment: WebSocketAttachment = {
      clientId: '',
      clientType: 'app', // placeholder, overwritten after successful AUTH
      authenticated: false,
      connectedAt: Date.now(),
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    // Best-effort 10-second auth timeout.
    // Note: in Durable Object hibernation the timer may not survive a sleep cycle,
    // but it fires reliably while the DO is awake during the handshake window.
    // The connectedAt check in webSocketMessage provides defence-in-depth.
    setTimeout(() => {
      const att = this.getAttachment(server);
      if (att && !att.authenticated) {
        server.close(4001, 'Authentication timeout');
      }
    }, 10_000);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const att = this.getAttachment(ws);
    if (!att) return;

    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);

    // ── Unauthenticated path — expect AUTH as the very first message ──────────
    if (!att.authenticated) {
      // Defence-in-depth: reject if the handshake window has expired
      if (Date.now() - att.connectedAt > 10_000) {
        ws.close(4001, 'Authentication timeout');
        return;
      }

      try {
        const raw = JSON.parse(text) as { type?: unknown; token?: unknown };
        if (raw.type !== MessageType.AUTH || typeof raw.token !== 'string') {
          ws.close(4001, 'Unauthorized');
          return;
        }

        const payload = await verifyToken(raw.token, this.env.JWT_SECRET);
        if (!payload) {
          ws.close(4001, 'Unauthorized');
          return;
        }

        // Auth successful — promote the attachment
        att.authenticated = true;
        att.clientId = payload.clientId;
        att.clientType = payload.clientType;
        ws.serializeAttachment(att);

        console.log(`[ws] ${payload.clientType} connected: ${payload.clientId}`);
      } catch {
        ws.close(4001, 'Unauthorized');
      }
      return;
    }

    // ── Authenticated path ────────────────────────────────────────────────────
    try {
      const raw = JSON.parse(text);
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
    if (!att || !att.authenticated) return; // unauthenticated socket closed, nothing to clean up

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
      await this.persistAgents();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    const att = this.getAttachment(ws);
    console.error(`[ws] Error from ${att?.clientId || 'unauthenticated'}:`, error);
  }

  private async routeMessage(
    message: RelayMessageType,
    sender: WebSocketAttachment,
    senderWs: WebSocket,
  ) {
    // Defence-in-depth: should never be reached for unauthenticated sockets
    if (!sender.authenticated) {
      senderWs.close(4001, 'Unauthorized');
      return;
    }

    const bridgeOnly = new Set<string>([
      MessageType.AGENT_REGISTER,
      MessageType.AGENT_UNREGISTER,
      MessageType.AGENT_HEARTBEAT,
      MessageType.CHAT_STREAM,
      MessageType.CHAT_STREAM_END,
      MessageType.CHAT_RECEIVE,
      MessageType.SESSIONS_UPDATE,
    ]);
    const appOnly = new Set<string>([
      MessageType.CHAT_SEND,
      MessageType.AGENT_LIST,
      MessageType.HISTORY_REQUEST,
      MessageType.SESSION_DELETE,
    ]);

    if (bridgeOnly.has(message.type) && sender.clientType !== 'bridge') {
      this.sendTo(senderWs, {
        id: crypto.randomUUID(),
        type: MessageType.ERROR,
        timestamp: Date.now(),
        code: 'FORBIDDEN',
        message: `Message type ${message.type} can only be sent by a bridge`,
      });
      return;
    }
    if (appOnly.has(message.type) && sender.clientType !== 'app') {
      this.sendTo(senderWs, {
        id: crypto.randomUUID(),
        type: MessageType.ERROR,
        timestamp: Date.now(),
        code: 'FORBIDDEN',
        message: `Message type ${message.type} can only be sent by an app`,
      });
      return;
    }

    switch (message.type) {
      case MessageType.AUTH:
        // Re-auth after handshake is silently ignored
        break;
      case MessageType.CHAT_SEND:
        await this.handleChatSend(message as ChatSend, sender);
        break;
      case MessageType.AGENT_REGISTER:
        await this.handleAgentRegister(message as AgentRegister, sender, senderWs);
        break;
      case MessageType.AGENT_UNREGISTER:
        await this.handleAgentUnregister(message as AgentUnregister, sender);
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
        this.log(`[chat] Stream token from bridge: ${(message as ChatStream).agentId}`);
        this.broadcastToApps(message);
        break;
      case MessageType.CHAT_STREAM_END:
        this.log(`[chat] Stream end from bridge: ${(message as ChatStreamEnd).agentId}`);
        await this.persistAssistantMessage(message as ChatStreamEnd);
        this.broadcastToApps(message);
        await this.notifyDisconnectedApps(
          (message as ChatStreamEnd).agentId,
          (message as ChatStreamEnd).content,
        );
        break;
      case MessageType.CHAT_RECEIVE:
        this.log(`[chat] Chat receive from bridge: ${(message as ChatReceive).agentId}`);
        await this.persistAssistantMessage(message as ChatReceive);
        this.broadcastToApps(message);
        await this.notifyDisconnectedApps(
          (message as ChatReceive).agentId,
          (message as ChatReceive).content,
        );
        break;
      case MessageType.SESSIONS_UPDATE:
        await this.handleSessionsUpdate(message as SessionsUpdate, sender);
        break;
      case MessageType.SESSION_DELETE:
        await this.handleSessionDelete(message as SessionDelete);
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
    if (!agent) {
      this.log(`[chat] Agent ${message.agentId} not found, dropping message`);
      return;
    }

    this.log(
      `[chat] ${sender.clientId} → ${message.agentId}: "${message.content.substring(0, 80)}"`,
    );

    // Persist user message
    try {
      await insertMessage(
        this.env.DB,
        message.id,
        message.agentId,
        'user',
        message.content,
        message.timestamp,
        message.sessionId,
      );

      // Track messages sent without a sessionId so we can adopt them
      // once the agent's response establishes a session
      if (!message.sessionId) {
        let pending = this.pendingUserMessages.get(message.agentId);
        if (!pending) {
          pending = new Set();
          this.pendingUserMessages.set(message.agentId, pending);
        }
        pending.add(message.id);
      }
    } catch (err) {
      console.error('[db] Failed to persist user message:', err);
    }

    const bridgeWs = this.findBridgeWebSocket(agent.bridgeId);
    if (!bridgeWs) {
      this.log(`[chat] Bridge ${agent.bridgeId} not found for agent ${message.agentId}`);
      return;
    }

    const forward: ChatForward = {
      id: crypto.randomUUID(),
      type: MessageType.CHAT_FORWARD,
      timestamp: Date.now(),
      agentId: message.agentId,
      content: message.content,
      userId: sender.clientId,
      ...(message.sessionId ? { sessionId: message.sessionId } : {}),
    };
    this.log(`[chat] Forwarding to bridge ${agent.bridgeId}`);
    this.sendTo(bridgeWs, forward);
  }

  private async handleAgentRegister(
    message: AgentRegister,
    sender: WebSocketAttachment,
    senderWs: WebSocket,
  ): Promise<void> {
    const agentInfo = message.agent;

    const existing = this.agents.get(agentInfo.id);
    if (existing && existing.bridgeId !== sender.clientId) {
      // If the existing registration is still online from a different bridge, reject
      if (existing.status === AgentStatus.ONLINE) {
        const oldBridge = this.findBridgeWebSocket(existing.bridgeId);
        if (oldBridge) {
          this.sendTo(senderWs, {
            id: crypto.randomUUID(),
            type: MessageType.ERROR,
            timestamp: Date.now(),
            code: 'AGENT_ALREADY_REGISTERED',
            message: `Agent ${agentInfo.id} is already registered by another bridge`,
          });
          return;
        }
      }
      // Old bridge is gone (offline/disconnected) — allow the new bridge to take over
      console.log(
        `[ws] Agent ${agentInfo.id} reclaimed by bridge ${sender.clientId} (was ${existing.bridgeId})`,
      );
    }

    this.agents.set(agentInfo.id, {
      ...agentInfo,
      status: AgentStatus.ONLINE,
      lastSeen: Date.now(),
      bridgeId: sender.clientId,
    });

    await this.persistAgents();

    this.broadcastToApps({
      id: crypto.randomUUID(),
      type: MessageType.AGENT_STATUS,
      timestamp: Date.now(),
      agentId: agentInfo.id,
      status: AgentStatus.ONLINE,
    });
  }

  private async handleAgentUnregister(
    message: AgentUnregister,
    sender: WebSocketAttachment,
  ): Promise<void> {
    const agent = this.agents.get(message.agentId);
    if (agent && agent.bridgeId === sender.clientId) {
      agent.status = AgentStatus.OFFLINE;
      await this.persistAgents();
      this.broadcastToApps({
        id: crypto.randomUUID(),
        type: MessageType.AGENT_STATUS,
        timestamp: Date.now(),
        agentId: message.agentId,
        status: AgentStatus.OFFLINE,
      });
    }
  }

  private handleHeartbeat(message: AgentHeartbeat, sender: WebSocketAttachment): void {
    let statusChanged = false;
    for (const agentId of message.agentIds) {
      const agent = this.agents.get(agentId);
      if (agent && agent.bridgeId === sender.clientId) {
        agent.lastSeen = Date.now();
        // Heartbeat from a connected bridge means the agent is alive — restore if offline
        if (agent.status !== AgentStatus.ONLINE) {
          this.log(`[ws] Heartbeat reviving agent ${agentId} from ${agent.status} to online`);
          agent.status = AgentStatus.ONLINE;
          statusChanged = true;
          this.broadcastToApps({
            id: crypto.randomUUID(),
            type: MessageType.AGENT_STATUS,
            timestamp: Date.now(),
            agentId,
            status: AgentStatus.ONLINE,
          });
        }
      }
    }
    if (statusChanged) {
      this.persistAgents().catch((err) =>
        console.error('[ws] Failed to persist agents after heartbeat status fix:', err),
      );
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
      const limit = Math.min(message.limit ?? 50, 200);
      const rows = await getHistory(
        this.env.DB,
        message.agentId,
        limit,
        message.before,
        message.sessionId,
      );

      this.sendTo(senderWs, {
        id: crypto.randomUUID(),
        type: MessageType.HISTORY_RESPONSE,
        timestamp: Date.now(),
        agentId: message.agentId,
        sessionId: message.sessionId,
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
        message.sessionId,
      );

      // Migrate tracked user messages (sent without a sessionId in a new chat)
      // to this session now that the agent's response has established one
      if (message.sessionId) {
        const pending = this.pendingUserMessages.get(message.agentId);
        if (pending && pending.size > 0) {
          await adoptOrphanedUserMessages(this.env.DB, message.agentId, message.sessionId, [
            ...pending,
          ]);
          this.pendingUserMessages.delete(message.agentId);
        }
      }
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

      const pushDevices = devices.filter((d) => d.push_token);
      await Promise.allSettled(
        pushDevices.map((device) =>
          sendPushNotification(device.push_token!, agentName, preview, { agentId }),
        ),
      );
    } catch (err) {
      console.error('[push] Failed to notify disconnected apps:', err);
    }
  }

  private async handleSessionsUpdate(
    message: SessionsUpdate,
    sender: WebSocketAttachment,
  ): Promise<void> {
    const agent = this.agents.get(message.agentId);
    if (!agent || agent.bridgeId !== sender.clientId) return;

    agent.sessions = message.sessions;
    await this.persistAgents();

    this.broadcastToApps({
      id: crypto.randomUUID(),
      type: MessageType.SESSIONS_UPDATE,
      timestamp: Date.now(),
      agentId: message.agentId,
      sessions: message.sessions,
    });
  }

  private async handleSessionDelete(message: SessionDelete): Promise<void> {
    const agent = this.agents.get(message.agentId);
    if (!agent) return;

    // Remove session from agent entry
    if (agent.sessions) {
      agent.sessions = agent.sessions.filter((s) => s.id !== message.sessionId);
    }
    await this.persistAgents();

    // Delete messages from D1
    try {
      await deleteSessionMessages(this.env.DB, message.agentId, message.sessionId);
    } catch (err) {
      console.error('[db] Failed to delete session messages:', err);
    }

    // Forward to the owning bridge so the agent can clean up
    const bridgeWs = this.findBridgeWebSocket(agent.bridgeId);
    if (bridgeWs) {
      this.sendTo(bridgeWs, {
        id: crypto.randomUUID(),
        type: MessageType.SESSION_DELETE_FORWARD,
        timestamp: Date.now(),
        agentId: message.agentId,
        sessionId: message.sessionId,
      });
    }

    // Broadcast updated sessions to all app clients
    this.broadcastToApps({
      id: crypto.randomUUID(),
      type: MessageType.SESSIONS_UPDATE,
      timestamp: Date.now(),
      agentId: message.agentId,
      sessions: agent.sessions ?? [],
    });
  }

  getAgentList(): AgentWithStatus[] {
    return Array.from(this.agents.values()).map(({ bridgeId: _, ...agent }) => agent);
  }
}
