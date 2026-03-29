import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
});

const BridgeConfigSchema = z.object({
  relayUrl: z.string(),
  token: z.string(),
  agents: z.array(AgentConfigSchema),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

export function loadConfig(): BridgeConfig {
  // Try config file first
  const configPath = join(homedir(), '.agent-home', 'config.json');
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return BridgeConfigSchema.parse(parsed);
  }

  // Fall back to env vars
  const relayUrl = process.env.RELAY_URL;
  const token = process.env.BRIDGE_TOKEN;

  if (!relayUrl || !token) {
    throw new Error(
      'No config found. Create ~/.agent-home/config.json or set RELAY_URL and BRIDGE_TOKEN env vars.',
    );
  }

  return {
    relayUrl,
    token,
    agents: [],
  };
}
