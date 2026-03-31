import { ClientType } from '@agent-home/protocol';
import { Hono } from 'hono';

import { deleteDevice, listDevicesByType, upsertDevice } from './db/index';
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

/** Constant-time string comparison to prevent timing attacks */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  const aKey = await crypto.subtle.importKey(
    'raw',
    aBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', aKey, bBytes);
  const bKey = await crypto.subtle.importKey(
    'raw',
    bBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig2 = await crypto.subtle.sign('HMAC', bKey, aBytes);
  return new Uint8Array(sig).every((v, i) => v === new Uint8Array(sig2)[i]);
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

// Generate a bridge token using any valid authenticated token
app.post('/auth/bridge-token', async (c) => {
  const payload = await authenticateRequest(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const clientId = crypto.randomUUID();
  const token = await createToken({ clientId, clientType: ClientType.BRIDGE }, c.env.JWT_SECRET);

  // Derive the relay URL from the request
  const url = new URL(c.req.url);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const relayUrl = `${protocol}//${url.host}/ws`;

  return c.json({ token, clientId, relayUrl });
});

// Generate a token (secured by provisioning secret in header)
app.post('/auth/token', async (c) => {
  const authHeader = c.req.header('Authorization') ?? '';
  const expected = `Bearer ${c.env.PROVISIONING_SECRET}`;
  if (!(await timingSafeEqual(authHeader, expected))) {
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

// Logs endpoint — recent relay event log
app.get('/logs', async (c) => {
  const id = c.env.RELAY_ROOM.idFromName('relay');
  const stub = c.env.RELAY_ROOM.get(id);
  const res = await stub.fetch(new Request('http://internal/logs'));
  const data = await res.json();
  return c.json(data);
});

// Debug endpoint — relay state inspection
app.get('/debug', async (c) => {
  const id = c.env.RELAY_ROOM.idFromName('relay');
  const stub = c.env.RELAY_ROOM.get(id);
  const res = await stub.fetch(new Request('http://internal/debug'));
  const data = await res.json();
  return c.json(data);
});

// REST agent list fallback
app.get('/agents', async (c) => {
  const payload = await authenticateRequest(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const id = c.env.RELAY_ROOM.idFromName('relay');
  const stub = c.env.RELAY_ROOM.get(id);
  const res = await stub.fetch(
    new Request('http://internal/agents', {
      headers: { Authorization: c.req.header('Authorization') ?? '' },
    }),
  );
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

// List registered devices scoped to the caller's client type
app.get('/devices', async (c) => {
  const payload = await authenticateRequest(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const devices = await listDevicesByType(c.env.DB, payload.clientType);
    return c.json({
      devices: devices.map(({ push_token: _, ...d }) => d),
    });
  } catch (err) {
    console.error('[relay] Failed to list devices:', err);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// Delete a registered device (only the owning client can delete)
app.delete('/devices/:id', async (c) => {
  const payload = await authenticateRequest(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const deviceId = c.req.param('id');

  // Ownership check — clients can only delete their own device registration
  if (deviceId !== payload.clientId) {
    return c.json({ error: 'Forbidden: can only delete your own device' }, 403);
  }

  try {
    await deleteDevice(c.env.DB, deviceId);
    return c.json({ success: true });
  } catch (err) {
    console.error('[relay] Failed to delete device:', err);
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
