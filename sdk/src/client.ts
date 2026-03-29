import { Transport } from './transport';
import {
  type AgentHomeClientOptions,
  type ChatForward,
  type IncomingMessage,
  MessageType,
  type ResponseStream,
} from './types';

let idCounter = 0;
function generateId(): string {
  return `sdk-${Date.now()}-${++idCounter}`;
}

type MessageHandler = (message: IncomingMessage, stream: ResponseStream) => void | Promise<void>;

export class AgentHomeClient {
  private transport: Transport;
  private options: AgentHomeClientOptions;
  private messageHandler: MessageHandler | null = null;
  private connectHandler: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;

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

    // Listen for forwarded chat messages
    this.transport.on(MessageType.CHAT_FORWARD, (raw) => {
      const msg = raw as unknown as ChatForward;
      if (this.messageHandler) {
        const incoming: IncomingMessage = {
          content: msg.content,
          userId: msg.userId,
          messageId: msg.id,
        };
        const stream = this.createResponseStream(msg);
        Promise.resolve(this.messageHandler(incoming, stream)).catch((err) => {
          stream.error(err instanceof Error ? err.message : String(err));
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

  private registerAgent(): void {
    this.transport.send({
      id: generateId(),
      type: MessageType.AGENT_REGISTER,
      timestamp: Date.now(),
      agent: this.options.agent,
    } as any);
  }

  private createResponseStream(forward: ChatForward): ResponseStream {
    const agentId = forward.agentId;
    const messageId = forward.id;

    return {
      token: (text: string) => {
        this.transport.send({
          id: generateId(),
          type: MessageType.CHAT_STREAM,
          timestamp: Date.now(),
          agentId,
          token: text,
          messageId,
        } as any);
      },
      end: (content: string) => {
        this.transport.send({
          id: generateId(),
          type: MessageType.CHAT_STREAM_END,
          timestamp: Date.now(),
          agentId,
          messageId,
          content,
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
