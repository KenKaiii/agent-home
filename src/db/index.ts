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
    last_message TEXT,
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

// Additive migrations for existing databases (ALTER TABLE ignores IF NOT EXISTS in SQLite)
try {
  expoDb.execSync(`ALTER TABLE agents ADD COLUMN last_message TEXT;`);
} catch {
  // Column already exists — safe to ignore
}
try {
  expoDb.execSync(`ALTER TABLE agents ADD COLUMN last_message_at INTEGER;`);
} catch {
  // Column already exists — safe to ignore
}
try {
  expoDb.execSync(`ALTER TABLE messages ADD COLUMN session_id TEXT;`);
} catch {
  // Column already exists — safe to ignore
}
try {
  expoDb.execSync(
    `CREATE INDEX IF NOT EXISTS idx_messages_agent_session ON messages(agent_id, session_id, created_at);`,
  );
} catch {
  // Index already exists — safe to ignore
}
try {
  expoDb.execSync(
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );`,
  );
} catch {
  // Table already exists — safe to ignore
}

export const db = drizzle(expoDb, { schema });
export { schema };
