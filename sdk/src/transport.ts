import { MessageType } from './types';
import type { BaseMessage } from './types';

const HEARTBEAT_INTERVAL = 30_000;
const RECONNECT_INTERVALS = [1000, 2000, 4000, 8000, 16000, 30000];

type MessageHandler = (message: BaseMessage & Record<string, unknown>) => void;

export class Transport {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatPayload: (() => BaseMessage) | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private connectCallback: (() => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  private intentionalClose = false;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  connect(): void {
    this.intentionalClose = false;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: BaseMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  onConnect(callback: () => void): void {
    this.connectCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  setHeartbeat(payloadFactory: () => BaseMessage): void {
    this.heartbeatPayload = payloadFactory;
  }

  private doConnect(): void {
    this.clearTimers();

    this.ws = new WebSocket(this.url);

    this.ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      // AUTH must be the very first message — sent before anything else
      this.ws!.send(
        JSON.stringify({
          id: crypto.randomUUID(),
          type: MessageType.AUTH,
          timestamp: Date.now(),
          token: this.token,
        }),
      );
      this.startHeartbeat();
      this.connectCallback?.();
    });

    this.ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(
          typeof event.data === 'string' ? event.data : String(event.data),
        ) as BaseMessage & Record<string, unknown>;
        const handlers = this.handlers.get(message.type);
        if (handlers) {
          for (const handler of handlers) {
            handler(message);
          }
        }
      } catch {
        // Silently ignore unparseable messages
      }
    });

    this.ws.addEventListener('close', () => {
      this.clearTimers();
      this.disconnectCallback?.();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    this.ws.addEventListener('error', () => {
      // Error is followed by close, reconnect handled there
    });
  }

  private startHeartbeat(): void {
    if (!this.heartbeatPayload) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.heartbeatPayload) {
        this.send(this.heartbeatPayload());
      }
    }, HEARTBEAT_INTERVAL);
  }

  private scheduleReconnect(): void {
    const delay =
      RECONNECT_INTERVALS[Math.min(this.reconnectAttempt, RECONNECT_INTERVALS.length - 1)];
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.doConnect();
    }, delay);
  }

  private clearTimers(): void {
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
