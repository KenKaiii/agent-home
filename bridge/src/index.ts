import dotenv from 'dotenv';

import { AgentManager } from './agent-manager.js';
import { loadConfig } from './config.js';
import { BridgeConnection } from './connection.js';

dotenv.config();

async function main() {
  console.log('[bridge] Loading config...');
  const config = loadConfig();

  console.log(`[bridge] Connecting to relay at ${config.relayUrl}`);
  const connection = new BridgeConnection(config.relayUrl, config.token);
  const manager = new AgentManager(connection);

  connection.onConnect(async () => {
    console.log('[bridge] Registering agents...');
    await manager.startAll(config.agents);
  });

  connection.connect();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[bridge] Shutting down...');
    await manager.stopAll();
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
