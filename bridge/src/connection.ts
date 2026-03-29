import {
  MessageType,
  type RelayMessage,
} from '@agent-home/protocol';
import { nanoid } from 'nanoid';
import WebSocket from 'ws';

const HEARTBEAT_INTERVAL = 30000;
const RECONNECT_INTERVALS = [1000, 2000, 4000, 8000, 16000, 30000];

type MessageHandler = (message: RelayMessage) => void;

export class BridgeConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private agentIds: string[] = [];
  private onConnectCallback: (() => void) | null = null;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  onConnect(callback: () => void) {
    this.onConnectCallback = callback;
  }

  connect() {
    this.doConnect();
  }

  disconnect() {
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: RelayMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
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

  setAgentIds(ids: string[]) {
    this.agentIds = ids;
  }

  private doConnect() {
    this.clearTimers();
    const sep = this.url.includes('?') ? '&' : '?';
    this.ws = new WebSocket(`${this.url}${sep}token=${this.token}`);

    this.ws.on('open', () => {
      console.log('[bridge] Connected to relay');
      this.reconnectAttempt = 0;
      this.startHeartbeat();
      this.onConnectCallback?.();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as RelayMessage;
        const handlers = this.handlers.get(message.type);
        if (handlers) {
          for (const handler of handlers) {
            handler(message);
          }
        }
      } catch (err) {
        console.error('[bridge] Failed to parse message:', err);
      }
    });

    this.ws.on('close', () => {
      console.log('[bridge] Disconnected from relay');
      this.clearTimers();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[bridge] WebSocket error:', err.message);
    });
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          id: nanoid(),
          type: MessageType.AGENT_HEARTBEAT,
          timestamp: Date.now(),
          agentIds: this.agentIds,
        });
      }
    }, HEARTBEAT_INTERVAL);
  }

  private scheduleReconnect() {
    const delay =
      RECONNECT_INTERVALS[
        Math.min(this.reconnectAttempt, RECONNECT_INTERVALS.length - 1)
      ];
    console.log(`[bridge] Reconnecting in ${delay}ms...`);
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
