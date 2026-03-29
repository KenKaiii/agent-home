import { ClientType } from '@agent-home/protocol';
import { Hono } from 'hono';

import { listDevices, upsertDevice } from './db/index';
import { type TokenPayload, createToken, verifyToken } from './lib/token';
import type { Env } from './types';

const VALID_PLATFORMS = ['ios', 'android', 'web', 'macos', 'linux', 'windows'] as const;

/** Extract and verify Bearer token from Authorization header */
async function authenticateRequest(
  authHeader: string | undefined,
  secret: string,
): Promise<TokenPayload | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7), secret);
}

export { RelayRoom } from './durable-objects/relay-room';

const app = new Hono<Env>();

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// Generate an app token using a valid bridge token (for QR pairing)
app.post('/auth/pair', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const bearerToken = authHeader.slice(7);
  const payload = await verifyToken(bearerToken, c.env.JWT_SECRET);
  if (!payload || payload.clientType !== ClientType.BRIDGE) {
    return c.json({ error: 'Unauthorized: valid bridge token required' }, 401);
  }

  const clientId = crypto.randomUUID();
  const token = await createToken({ clientId, clientType: ClientType.APP }, c.env.JWT_SECRET);

  return c.json({ token, clientId });
});

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
  const payload = await authenticateRequest(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const id = c.env.RELAY_ROOM.idFromName('relay');
  const stub = c.env.RELAY_ROOM.get(id);
  const res = await stub.fetch(new Request('http://internal/agents'));
  const data = await res.json();
  return c.json(data);
});

// Register device push token
app.post('/devices/register', async (c) => {
  const payload = await authenticateRequest(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{
    pushToken?: string;
    deviceName?: string;
    platform?: string;
    appVersion?: string;
  }>();

  if (
    body.platform &&
    !VALID_PLATFORMS.includes(body.platform as (typeof VALID_PLATFORMS)[number])
  ) {
    return c.json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` }, 400);
  }

  try {
    await upsertDevice(
      c.env.DB,
      payload.clientId,
      body.pushToken ?? undefined,
      payload.clientType,
      body.deviceName,
      body.platform,
      body.appVersion,
    );
    return c.json({ ok: true });
  } catch (err) {
    console.error('[relay] Failed to register device:', err);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// List all registered devices
app.get('/devices', async (c) => {
  const payload = await authenticateRequest(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const devices = await listDevices(c.env.DB);
    return c.json({
      devices: devices.map(({ push_token: _, ...d }) => d),
    });
  } catch (err) {
    console.error('[relay] Failed to list devices:', err);
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
