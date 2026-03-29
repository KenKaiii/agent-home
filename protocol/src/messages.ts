import { z } from 'zod';

import { AgentInfoSchema, AgentWithStatusSchema } from './agent';
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
});
export type ChatSend = z.infer<typeof ChatSendSchema>;

// Relay → Client: complete message from agent
export const ChatReceiveSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT_RECEIVE),
  agentId: z.string(),
  content: z.string(),
  messageId: z.string(),
});
export type ChatReceive = z.infer<typeof ChatReceiveSchema>;

// Relay → Client: streaming token from agent
export const ChatStreamSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT_STREAM),
  agentId: z.string(),
  token: z.string(),
  messageId: z.string(),
});
export type ChatStream = z.infer<typeof ChatStreamSchema>;

// Relay → Client: end of streaming
export const ChatStreamEndSchema = BaseMessage.extend({
  type: z.literal(MessageType.CHAT_STREAM_END),
  agentId: z.string(),
  messageId: z.string(),
  content: z.string(), // full assembled content
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
});
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;

// Relay → Client: chat history response
export const HistoryResponseSchema = BaseMessage.extend({
  type: z.literal(MessageType.HISTORY_RESPONSE),
  agentId: z.string(),
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
});
export type ChatForward = z.infer<typeof ChatForwardSchema>;

// Error message
export const ErrorMessageSchema = BaseMessage.extend({
  type: z.literal(MessageType.ERROR),
  code: z.string(),
  message: z.string(),
});
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

// Discriminated union of all messages
export const RelayMessageSchema = z.discriminatedUnion('type', [
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
]);
export type RelayMessage = z.infer<typeof RelayMessageSchema>;
