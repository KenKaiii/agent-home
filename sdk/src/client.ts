import { Transport } from './transport';
import {
  type AgentHomeClientOptions,
  type AgentSession,
  type ChatForward,
  type IncomingMessage,
  MessageType,
  type ResponseStream,
  type StreamOptions,
} from './types';

let idCounter = 0;
function generateId(): string {
  return `sdk-${Date.now()}-${++idCounter}`;
}

type MessageHandler = (message: IncomingMessage, stream: ResponseStream) => void | Promise<void>;
type SessionDeleteHandler = (sessionId: string) => void | Promise<void>;

export class AgentHomeClient {
  private transport: Transport;
  private options: AgentHomeClientOptions;
  private messageHandler: MessageHandler | null = null;
  private connectHandler: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private sessionDeleteHandler: SessionDeleteHandler | null = null;
  /** Session IDs deleted by the user — auto-filtered from updateSessions() calls */
  private deletedSessionIds = new Set<string>();

  constructor(options: AgentHomeClientOptions) {
    this.options = options;
    this.transport = new Transport(options.relayUrl, options.token);

    this.transport.onConnect(() => {
      this.registerAgent();
      this.connectHandler?.();
    });

    this.transport.onDisconnect(() => {
      this.disconnectHandler?.();
    });

    // Set up heartbeat payload
    this.transport.setHeartbeat(() => ({
      id: generateId(),
      type: MessageType.AGENT_HEARTBEAT,
      timestamp: Date.now(),
      agentIds: [this.options.agent.id],
    }));

    // Log errors from the relay
    this.transport.on(MessageType.ERROR, (raw) => {
      const code = (raw as Record<string, unknown>).code ?? '';
      const message = (raw as Record<string, unknown>).message ?? '';
      console.error(`[agent-home] Relay error (${code}): ${message}`);
    });

    // Listen for forwarded chat messages
    this.transport.on(MessageType.CHAT_FORWARD, (raw) => {
      const msg = raw as unknown as ChatForward;
      if (this.messageHandler) {
        const incoming: IncomingMessage = {
          content: msg.content,
          userId: msg.userId,
          messageId: msg.id,
          sessionId: msg.sessionId,
        };
        const stream = this.createResponseStream(msg);
        Promise.resolve(this.messageHandler(incoming, stream)).catch((err) => {
          stream.error(err instanceof Error ? err.message : String(err));
        });
      }
    });

    // Listen for session delete forwards
    this.transport.on(MessageType.SESSION_DELETE_FORWARD, (raw) => {
      const msg = raw as unknown as { agentId: string; sessionId: string };
      // Auto-track so updateSessions() never re-pushes deleted sessions
      this.deletedSessionIds.add(msg.sessionId);
      if (this.sessionDeleteHandler) {
        Promise.resolve(this.sessionDeleteHandler(msg.sessionId)).catch((err) => {
          console.error('[agent-home] Session delete handler error:', err);
        });
      }
    });
  }

  /** Start connecting to the relay */
  connect(): void {
    this.transport.connect();
  }

  /** Disconnect from the relay */
  disconnect(): void {
    // Unregister agent before disconnecting
    this.transport.send({
      id: generateId(),
      type: MessageType.AGENT_UNREGISTER,
      timestamp: Date.now(),
      agentId: this.options.agent.id,
    } as any);
    this.transport.disconnect();
  }

  /** Register a handler for incoming messages */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /** Register a handler called when connected to the relay */
  onConnect(handler: () => void): void {
    this.connectHandler = handler;
  }

  /** Register a handler called when disconnected from the relay */
  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  /** Register a handler called when a session is deleted */
  onSessionDelete(handler: SessionDeleteHandler): void {
    this.sessionDeleteHandler = handler;
  }

  private registerAgent(): void {
    this.transport.send({
      id: generateId(),
      type: MessageType.AGENT_REGISTER,
      timestamp: Date.now(),
      agent: this.options.agent,
    } as any);
  }

  /** Push an updated session list for this agent */
  updateSessions(sessions: AgentSession[]): void {
    // Auto-filter sessions that were deleted by the user
    const filtered =
      this.deletedSessionIds.size > 0
        ? sessions.filter((s) => !this.deletedSessionIds.has(s.id))
        : sessions;
    this.transport.send({
      id: generateId(),
      type: MessageType.SESSIONS_UPDATE,
      timestamp: Date.now(),
      agentId: this.options.agent.id,
      sessions: filtered,
    } as any);
  }

  private createResponseStream(forward: ChatForward): ResponseStream {
    const agentId = forward.agentId;
    const messageId = forward.id;
    const defaultSessionId = forward.sessionId;

    return {
      token: (text: string, options?: StreamOptions) => {
        const sid = options?.sessionId ?? defaultSessionId;
        this.transport.send({
          id: generateId(),
          type: MessageType.CHAT_STREAM,
          timestamp: Date.now(),
          agentId,
          token: text,
          messageId,
          ...(sid ? { sessionId: sid } : {}),
        } as any);
      },
      end: (content: string, options?: StreamOptions) => {
        const sid = options?.sessionId ?? defaultSessionId;
        this.transport.send({
          id: generateId(),
          type: MessageType.CHAT_STREAM_END,
          timestamp: Date.now(),
          agentId,
          messageId,
          content,
          ...(sid ? { sessionId: sid } : {}),
        } as any);
      },
      error: (message: string) => {
        this.transport.send({
          id: generateId(),
          type: MessageType.ERROR,
          timestamp: Date.now(),
          code: 'AGENT_ERROR',
          message,
        } as any);
      },
    };
  }
}
