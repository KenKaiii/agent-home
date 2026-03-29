import {
  MessageType,
  type RelayMessage,
} from '@agent-home/protocol';
import { nanoid } from 'nanoid/non-secure';

import { HEARTBEAT_INTERVAL, RECONNECT_INTERVALS } from './config';

type MessageHandler = (message: RelayMessage) => void;

export class RelayClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private token: string = '';
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sendQueue: string[] = [];
  private _isConnected = false;

  get isConnected() {
    return this._isConnected;
  }

  connect(url: string, token: string) {
    this.url = url.trim();
    this.token = token.trim();
    this.doConnect();
  }

  disconnect() {
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
  }

  send(message: RelayMessage) {
    const data = JSON.stringify(message);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.sendQueue.push(data);
    }
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  onAny(handler: MessageHandler) {
    return this.on('*', handler);
  }

  private doConnect() {
    this.clearTimers();

    const separator = this.url.includes('?') ? '&' : '?';
    const wsUrl = `${this.url}${separator}token=${this.token}`;

    console.log('[ws] Connecting to:', this.url);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[ws] Connected to relay');
      this._isConnected = true;
      this.reconnectAttempt = 0;
      this.flushQueue();
      this.startHeartbeat();
      // Request agent list from server
      const agentListReq = {
        id: nanoid(),
        type: MessageType.AGENT_LIST,
        timestamp: Date.now(),
      };
      this.ws!.send(JSON.stringify(agentListReq));
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as RelayMessage;
        this.emit(message.type, message);
        this.emit('*', message);
      } catch (err) {
        console.error('[ws] Failed to parse message:', err);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[ws] Disconnected from relay, code:', event.code, 'reason:', event.reason);
      this._isConnected = false;
      this.clearTimers();
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[ws] WebSocket error:', this.url, err);
    };
  }

  private emit(type: string, message: RelayMessage) {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(message);
      }
    }
  }

  private flushQueue() {
    while (this.sendQueue.length > 0) {
      const data = this.sendQueue.shift()!;
      this.ws?.send(data);
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send a simple ping-like message
        this.ws.send(
          JSON.stringify({
            id: nanoid(),
            type: MessageType.AGENT_HEARTBEAT,
            timestamp: Date.now(),
            agentIds: [],
          }),
        );
      }
    }, HEARTBEAT_INTERVAL);
  }

  private scheduleReconnect() {
    const delay =
      RECONNECT_INTERVALS[
        Math.min(this.reconnectAttempt, RECONNECT_INTERVALS.length - 1)
      ];
    console.log(`[ws] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.doConnect();
    }, delay);
  }

  private clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// Singleton
export const relayClient = new RelayClient();
