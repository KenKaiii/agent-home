export async function insertMessage(
  db: D1Database,
  id: string,
  agentId: string,
  role: string,
  content: string,
  createdAt: number,
) {
  await db
    .prepare(
      'INSERT OR IGNORE INTO messages (id, agent_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(id, agentId, role, content, createdAt)
    .run();
}

export async function getHistory(
  db: D1Database,
  agentId: string,
  limit: number = 50,
): Promise<{ id: string; role: string; content: string; created_at: number }[]> {
  const result = await db
    .prepare(
      'SELECT id, role, content, created_at FROM messages WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .bind(agentId, limit)
    .all<{ id: string; role: string; content: string; created_at: number }>();
  return result.results.reverse();
}

export async function upsertDevice(
  db: D1Database,
  id: string,
  pushToken: string,
  clientType: string,
) {
  await db
    .prepare(
      'INSERT INTO devices (id, push_token, client_type, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET push_token = ?',
    )
    .bind(id, pushToken, clientType, Date.now(), pushToken)
    .run();
}

export async function getDevicesByType(
  db: D1Database,
  clientType: string,
): Promise<{ id: string; push_token: string | null }[]> {
  const result = await db
    .prepare('SELECT id, push_token FROM devices WHERE client_type = ?')
    .bind(clientType)
    .all<{ id: string; push_token: string | null }>();
  return result.results;
}
