import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  status: text('status').notNull().default('offline'),
  lastMessage: text('last_message'),
  lastMessageAt: integer('last_message_at'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  title: text('title').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  streaming: integer('streaming').notNull().default(0), // boolean: 0 or 1
  createdAt: integer('created_at').notNull(),
  sessionId: text('session_id'),
});
