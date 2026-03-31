import { z } from 'zod';

import { AgentInfoSchema, AgentSessionSchema, AgentWithStatusSchema } from './agent';
import { AgentStatus, MessageType } from './enums';

// Base envelope
const BaseMessage = z.object({
  id: z.string(),
  type: z.nativeEnum(MessageType),
  timestamp: z.number(),
});

// Client → Relay: send a chat message to an agent
export const ChatSendSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT_SEND),
  agentId: z.string(),
  content: z.string(),
  sessionId: z.string().optional(),
});
export type ChatSend = z.infer<typeof ChatSendSchema>;

// Relay → Client: complete message from agent
export const ChatReceiveSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT_RECEIVE),
  agentId: z.string(),
  content: z.string(),
  messageId: z.string(),
  sessionId: z.string().optional(),
});
export type ChatReceive = z.infer<typeof ChatReceiveSchema>;

// Relay → Client: streaming token from agent
export const ChatStreamSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT_STREAM),
  agentId: z.string(),
  token: z.string(),
  messageId: z.string(),
  sessionId: z.string().optional(),
});
export type ChatStream = z.infer<typeof ChatStreamSchema>;

// Relay → Client: end of streaming
export const ChatStreamEndSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT_STREAM_END),
  agentId: z.string(),
  messageId: z.string(),
  content: z.string(), // full assembled content
  sessionId: z.string().optional(),
});
export type ChatStreamEnd = z.infer<typeof ChatStreamEndSchema>;

// Client → Relay: request agent list
export const AgentListRequestSchema = BaseMessage.extend({
  type: z.literal(MessageType.AGENT_LIST),
});
export type AgentListRequest = z.infer<typeof AgentListRequestSchema>;

// Relay → Client: agent list response
export const AgentListResponseSchema = BaseMessage.extend({
  type: z.literal(MessageType.AGENT_LIST_RESPONSE),
  agents: z.array(AgentWithStatusSchema),
});
export type AgentListResponse = z.infer<typeof AgentListResponseSchema>;

// Relay → Client/Bridge: agent status change
export const AgentStatusMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.AGENT_STATUS),
  agentId: z.string(),
  status: z.nativeEnum(AgentStatus),
});
export type AgentStatusMessage = z.infer<typeof AgentStatusMessageSchema>;

// Client → Relay: request chat history
export const HistoryRequestSchema = BaseMessage.extend({
  type: z.literal(MessageType.HISTORY_REQUEST),
  agentId: z.string(),
  limit: z.number().optional(),
  before: z.number().optional(), // timestamp cursor
  sessionId: z.string().optional(),
});
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;

// Relay → Client: chat history response
export const HistoryResponseSchema = BaseMessage.extend({
  type: z.literal(MessageType.HISTORY_RESPONSE),
  agentId: z.string(),
  sessionId: z.string().optional(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      createdAt: z.number(),
    }),
  ),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

// Bridge → Relay: register an agent
export const AgentRegisterSchema = BaseMessage.extend({
  type: z.literal(MessageType.AGENT_REGISTER),
  agent: AgentInfoSchema,
});
export type AgentRegister = z.infer<typeof AgentRegisterSchema>;

// Bridge → Relay: unregister an agent
export const AgentUnregisterSchema = BaseMessage.extend({
  type: z.literal(MessageType.AGENT_UNREGISTER),
  agentId: z.string(),
});
export type AgentUnregister = z.infer<typeof AgentUnregisterSchema>;

// Bridge → Relay: heartbeat
export const AgentHeartbeatSchema = BaseMessage.extend({
  type: z.literal(MessageType.AGENT_HEARTBEAT),
  agentIds: z.array(z.string()),
});
export type AgentHeartbeat = z.infer<typeof AgentHeartbeatSchema>;

// Relay → Bridge: forward user message to agent
export const ChatForwardSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT_FORWARD),
  agentId: z.string(),
  content: z.string(),
  userId: z.string(),
  sessionId: z.string().optional(),
});
export type ChatForward = z.infer<typeof ChatForwardSchema>;

// Error message
export const ErrorMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.ERROR),
  code: z.string(),
  message: z.string(),
  agentId: z.string().optional(),
});
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

// Handshake — sent as the very first message after WebSocket connect
export const AuthMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.AUTH),
  token: z.string(),
});
export type AuthMessage = z.infer<typeof AuthMessageSchema>;

// Bridge → Relay → App: agent pushes session list changes
export const SessionsUpdateSchema = BaseMessage.extend({
  type: z.literal(MessageType.SESSIONS_UPDATE),
  agentId: z.string(),
  sessions: z.array(AgentSessionSchema),
});
export type SessionsUpdate = z.infer<typeof SessionsUpdateSchema>;

// App → Relay: delete a session
export const SessionDeleteSchema = BaseMessage.extend({
  type: z.literal(MessageType.SESSION_DELETE),
  agentId: z.string(),
  sessionId: z.string(),
});
export type SessionDelete = z.infer<typeof SessionDeleteSchema>;

// Relay → Bridge: forward session deletion to agent
export const SessionDeleteForwardSchema = BaseMessage.extend({
  type: z.literal(MessageType.SESSION_DELETE_FORWARD),
  agentId: z.string(),
  sessionId: z.string(),
});
export type SessionDeleteForward = z.infer<typeof SessionDeleteForwardSchema>;

// Discriminated union of all messages
export const RelayMessageSchema = z.discriminatedUnion('type', [
  AuthMessageSchema,
  ChatSendSchema,
  ChatReceiveSchema,
  ChatStreamSchema,
  ChatStreamEndSchema,
  AgentListRequestSchema,
  AgentListResponseSchema,
  AgentStatusMessageSchema,
  HistoryRequestSchema,
  HistoryResponseSchema,
  AgentRegisterSchema,
  AgentUnregisterSchema,
  AgentHeartbeatSchema,
  ChatForwardSchema,
  ErrorMessageSchema,
  SessionsUpdateSchema,
  SessionDeleteSchema,
  SessionDeleteForwardSchema,
]);
export type RelayMessage = z.infer<typeof RelayMessageSchema>;
