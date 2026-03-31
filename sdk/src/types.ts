// Inlined protocol types — no zod dependency

export enum MessageType {
  // Handshake — first message after connect, before any other message
  AUTH = 'auth',

  // Client → Relay
  CHAT_SEND = 'chat.send',
  AGENT_LIST = 'agent.list',
  HISTORY_REQUEST = 'history.request',

  // Relay → Client
  CHAT_RECEIVE = 'chat.receive',
  CHAT_STREAM = 'chat.stream',
  CHAT_STREAM_END = 'chat.stream.end',
  AGENT_LIST_RESPONSE = 'agent.list.response',
  AGENT_STATUS = 'agent.status',
  HISTORY_RESPONSE = 'history.response',
  ERROR = 'error',

  // Bridge → Relay
  AGENT_REGISTER = 'agent.register',
  AGENT_UNREGISTER = 'agent.unregister',
  AGENT_HEARTBEAT = 'agent.heartbeat',

  // Relay → Bridge
  CHAT_FORWARD = 'chat.forward',

  // Bridge → Relay → App: agent pushes session list changes
  SESSIONS_UPDATE = 'sessions.update',

  // App → Relay: delete a session
  SESSION_DELETE = 'session.delete',

  // Relay → Bridge: forward session deletion to agent
  SESSION_DELETE_FORWARD = 'session.delete.forward',
}

export enum AgentStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
}

export interface AgentSession {
  id: string;
  title: string;
  updatedAt: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  capabilities?: string[];
}

// Base message envelope
export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: number;
}

// Bridge → Relay: register an agent
export interface AgentRegister extends BaseMessage {
  type: MessageType.AGENT_REGISTER;
  agent: AgentInfo;
}

// Bridge → Relay: unregister an agent
export interface AgentUnregister extends BaseMessage {
  type: MessageType.AGENT_UNREGISTER;
  agentId: string;
}

// Bridge → Relay: heartbeat
export interface AgentHeartbeat extends BaseMessage {
  type: MessageType.AGENT_HEARTBEAT;
  agentIds: string[];
}

// Relay → Bridge: forward user message to agent
export interface ChatForward extends BaseMessage {
  type: MessageType.CHAT_FORWARD;
  agentId: string;
  content: string;
  userId: string;
  sessionId?: string;
}

// Bridge → Relay: streaming token
export interface ChatStream extends BaseMessage {
  type: MessageType.CHAT_STREAM;
  agentId: string;
  token: string;
  messageId: string;
  sessionId?: string;
}

// Bridge → Relay: end of stream
export interface ChatStreamEnd extends BaseMessage {
  type: MessageType.CHAT_STREAM_END;
  agentId: string;
  messageId: string;
  content: string;
  sessionId?: string;
}

// Bridge → Relay: complete response (non-streaming)
export interface ChatReceive extends BaseMessage {
  type: MessageType.CHAT_RECEIVE;
  agentId: string;
  content: string;
  messageId: string;
  sessionId?: string;
}

// Error message
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  code: string;
  message: string;
}

// Bridge → Relay → App: session list update
export interface SessionsUpdateMessage extends BaseMessage {
  type: MessageType.SESSIONS_UPDATE;
  agentId: string;
  sessions: AgentSession[];
}

// Union of messages the SDK sends
export type OutgoingMessage =
  | AgentRegister
  | AgentUnregister
  | AgentHeartbeat
  | ChatStream
  | ChatStreamEnd
  | ChatReceive
  | ErrorMessage
  | SessionsUpdateMessage;

// Relay → Bridge: session deletion notification
export interface SessionDeleteForward extends BaseMessage {
  type: MessageType.SESSION_DELETE_FORWARD;
  agentId: string;
  sessionId: string;
}

// Union of messages the SDK receives
export type IncomingRelayMessage = ChatForward | ErrorMessage | SessionDeleteForward;

// High-level incoming message for consumer callbacks
export interface IncomingMessage {
  content: string;
  userId: string;
  messageId: string;
  sessionId?: string;
}

export interface StreamOptions {
  /** Override the sessionId for this response (useful when creating a new session for a sessionless message) */
  sessionId?: string;
}

// Response stream for sending back tokens/results
export interface ResponseStream {
  /** Send a streaming token */
  token(text: string, options?: StreamOptions): void;
  /** Finalize the response with full assembled content */
  end(content: string, options?: StreamOptions): void;
  /** Send an error response */
  error(message: string): void;
}

// Client options
export interface AgentHomeClientOptions {
  relayUrl: string;
  token: string;
  agent: AgentInfo;
}
