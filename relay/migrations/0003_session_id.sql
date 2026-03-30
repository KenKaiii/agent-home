-- Add optional session_id column to messages table
ALTER TABLE messages ADD COLUMN session_id TEXT;

-- Index for efficient session-scoped history queries
CREATE INDEX IF NOT EXISTS idx_messages_agent_session ON messages (agent_id, session_id, created_at);
