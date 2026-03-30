import { z } from 'zod';

import { AgentStatus } from './enums';

export const AgentSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
});

export type AgentSession = z.infer<typeof AgentSessionSchema>;

export const AgentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

export type AgentInfo = z.infer<typeof AgentInfoSchema>;

export const AgentWithStatusSchema = AgentInfoSchema.extend({
  status: z.nativeEnum(AgentStatus),
  lastSeen: z.number().optional(),
  sessions: z.array(AgentSessionSchema).optional(),
});

export type AgentWithStatus = z.infer<typeof AgentWithStatusSchema>;
