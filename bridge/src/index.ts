import dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';

import { AgentManager } from './agent-manager.js';
import { loadConfig } from './config.js';
import { BridgeConnection } from './connection.js';

dotenv.config();

function deriveHttpUrl(wsUrl: string): string {
  return wsUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/ws\/?$/, '');
}

async function generatePairingQR(relayUrl: string, bridgeToken: string): Promise<void> {
  try {
    const httpUrl = deriveHttpUrl(relayUrl);
    const response = await fetch(`${httpUrl}/auth/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bridgeToken}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[bridge] Failed to generate pairing token: ${response.status} ${body}`);
      return;
    }

    const { token } = (await response.json()) as { token: string; clientId: string };
    const qrPayload = JSON.stringify({ url: relayUrl, token });

    console.log('\n[bridge] Scan this QR code with the Agent Home app to pair:\n');
    qrcode.generate(qrPayload, { small: true });
    console.log('');
  } catch (err) {
    console.error('[bridge] Failed to generate pairing QR code:', err);
  }
}

async function main() {
  console.log('[bridge] Loading config...');
  const config = loadConfig();

  console.log(`[bridge] Connecting to relay at ${config.relayUrl}`);
  const connection = new BridgeConnection(config.relayUrl, config.token);
  const manager = new AgentManager(connection);

  connection.onConnect(async () => {
    console.log('[bridge] Registering agents...');
    await manager.startAll(config.agents);
    await generatePairingQR(config.relayUrl, config.token);
  });

  connection.connect();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[bridge] Shutting down...');
    await manager.stopAll();
    // Give the WebSocket send buffer time to flush before closing
    await new Promise((resolve) => setTimeout(resolve, 500));
    connection.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[bridge] Fatal error:', err);
  process.exit(1);
});
