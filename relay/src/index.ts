import { ClientType } from '@agent-home/protocol';
import { Hono } from 'hono';

import { upsertDevice } from './db/index';
import { createToken } from './lib/token';
import type { Env } from './types';

export { RelayRoom } from './durable-objects/relay-room';

const app = new Hono<Env>();

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// Generate a token (secured by shared secret in header)
app.post('/auth/token', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.JWT_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{
    clientType: string;
    clientId?: string;
  }>();

  const clientType = body.clientType === 'bridge' ? ClientType.BRIDGE : ClientType.APP;
  const clientId = body.clientId ?? crypto.randomUUID();
  const token = await createToken({ clientId, clientType }, c.env.JWT_SECRET);

  return c.json({ token, clientId });
});

// REST agent list fallback
app.get('/agents', async (c) => {
  const id = c.env.RELAY_ROOM.idFromName('relay');
  const stub = c.env.RELAY_ROOM.get(id);
  const room = stub as unknown as { getAgentList(): unknown[] };
  return c.json({ agents: room.getAgentList() });
});

// Register device push token
app.post('/devices/register', async (c) => {
  const body = await c.req.json<{
    clientId: string;
    pushToken: string;
  }>();

  if (!body.clientId || !body.pushToken) {
    return c.json({ error: 'clientId and pushToken required' }, 400);
  }

  try {
    await upsertDevice(c.env.DB, body.clientId, body.pushToken, 'app');
    return c.json({ ok: true });
  } catch (err) {
    console.error('[relay] Failed to register device:', err);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// WebSocket upgrade → Durable Object
app.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  const id = c.env.RELAY_ROOM.idFromName('relay');
  const stub = c.env.RELAY_ROOM.get(id);
  return stub.fetch(c.req.raw);
});

export default app;
