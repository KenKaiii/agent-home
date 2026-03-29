import { MessageType, type RelayMessage } from '@agent-home/protocol';
import { nanoid } from 'nanoid/non-secure';

import { HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT, RECONNECT_INTERVALS } from './config';

type MessageHandler = (message: RelayMessage) => void;

export class RelayClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private token: string = '';
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
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

    if (this.reconnectAttempt === 0) {
      console.log('[ws] Connecting to:', this.url);
    }

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
        this.clearHeartbeatTimeout();
        const message = JSON.parse(event.data as string) as RelayMessage;
        this.emit(message.type, message);
        this.emit('*', message);
      } catch (err) {
        console.error('[ws] Failed to parse message:', err);
      }
    };

    this.ws.onclose = () => {
      const wasConnected = this._isConnected;
      this._isConnected = false;
      this.clearTimers();
      if (wasConnected) {
        console.log('[ws] Disconnected from relay');
      }
      this.scheduleReconnect();
    };

    // onerror always fires before onclose — suppress to avoid duplicate noise
    this.ws.onerror = () => {};
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
        // Send an agent list request as keepalive (also syncs agent state)
        this.ws.send(
          JSON.stringify({
            id: nanoid(),
            type: MessageType.AGENT_LIST,
            timestamp: Date.now(),
          }),
        );

        // Arm a timeout — if no message arrives before it fires, the server is unresponsive
        this.heartbeatTimeoutTimer = setTimeout(() => {
          console.log('[ws] No heartbeat response, closing connection');
          this.ws?.close(4000, 'Heartbeat timeout');
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }

  private clearHeartbeatTimeout() {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private scheduleReconnect() {
    const delay =
      RECONNECT_INTERVALS[Math.min(this.reconnectAttempt, RECONNECT_INTERVALS.length - 1)];
    // Only log the first few attempts, then go quiet
    if (this.reconnectAttempt < 3) {
      console.log(`[ws] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempt + 1})`);
    } else if (this.reconnectAttempt === 3) {
      console.log('[ws] Still reconnecting, suppressing further logs until connected');
    }
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
    this.clearHeartbeatTimeout();
  }
}

// Singleton
export const relayClient = new RelayClient();
