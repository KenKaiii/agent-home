import { openDatabaseSync } from 'expo-sqlite';

import { drizzle } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';

const DB_NAME = 'agent-home.db';

const expoDb = openDatabaseSync(DB_NAME);

// Run migrations inline
expoDb.execSync(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    status TEXT NOT NULL DEFAULT 'offline',
    last_message_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    streaming INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
`);

export const db = drizzle(expoDb, { schema });
export { schema };
