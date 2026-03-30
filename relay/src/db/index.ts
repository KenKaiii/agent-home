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
  before?: number,
): Promise<{ id: string; role: string; content: string; created_at: number }[]> {
  if (before) {
    const result = await db
      .prepare(
        'SELECT id, role, content, created_at FROM messages WHERE agent_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?',
      )
      .bind(agentId, before, limit)
      .all<{ id: string; role: string; content: string; created_at: number }>();
    return result.results.reverse();
  }
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
  pushToken: string | undefined,
  clientType: string,
  deviceName?: string,
  platform?: string,
  appVersion?: string,
) {
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO devices (id, push_token, client_type, device_name, platform, app_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET push_token = COALESCE(?, push_token), device_name = COALESCE(?, device_name), platform = COALESCE(?, platform), app_version = COALESCE(?, app_version), updated_at = ?',
    )
    .bind(
      id,
      pushToken ?? null,
      clientType,
      deviceName ?? null,
      platform ?? null,
      appVersion ?? null,
      now,
      now,
      pushToken ?? null,
      deviceName ?? null,
      platform ?? null,
      appVersion ?? null,
      now,
    )
    .run();
}

export async function listDevices(db: D1Database): Promise<
  {
    id: string;
    push_token: string | null;
    client_type: string;
    device_name: string | null;
    platform: string | null;
    app_version: string | null;
    created_at: number;
    updated_at: number | null;
  }[]
> {
  const result = await db
    .prepare(
      'SELECT id, push_token, client_type, device_name, platform, app_version, created_at, updated_at FROM devices ORDER BY created_at DESC',
    )
    .all<{
      id: string;
      push_token: string | null;
      client_type: string;
      device_name: string | null;
      platform: string | null;
      app_version: string | null;
      created_at: number;
      updated_at: number | null;
    }>();
  return result.results;
}

export async function listDevicesByType(
  db: D1Database,
  clientType: string,
): Promise<
  {
    id: string;
    push_token: string | null;
    client_type: string;
    device_name: string | null;
    platform: string | null;
    app_version: string | null;
    created_at: number;
    updated_at: number | null;
  }[]
> {
  const result = await db
    .prepare(
      'SELECT id, push_token, client_type, device_name, platform, app_version, created_at, updated_at FROM devices WHERE client_type = ? ORDER BY created_at DESC',
    )
    .bind(clientType)
    .all<{
      id: string;
      push_token: string | null;
      client_type: string;
      device_name: string | null;
      platform: string | null;
      app_version: string | null;
      created_at: number;
      updated_at: number | null;
    }>();
  return result.results;
}

export async function deleteDevice(db: D1Database, deviceId: string): Promise<void> {
  await db.prepare('DELETE FROM devices WHERE id = ?').bind(deviceId).run();
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
