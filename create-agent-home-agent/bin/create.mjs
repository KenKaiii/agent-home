#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--token' && args[i + 1]) flags.token = args[++i];
  else if (arg === '--url' && args[i + 1]) flags.url = args[++i];
  else if (arg === '--name' && args[i + 1]) flags.name = args[++i];
  else if (arg === '--id' && args[i + 1]) flags.id = args[++i];
  else if (arg === '--description' && args[i + 1]) flags.description = args[++i];
  else if (arg === '--filename' && args[i + 1]) flags.filename = args[++i];
  else if (arg === '--yes' || arg === '-y') flags.yes = true;
  else if (arg === '--no-install') flags.noInstall = true;
  else if (arg === '--help' || arg === '-h') {
    console.log(`
  create-agent-home-agent — scaffold an Agent Home agent

  Usage:
    npx create-agent-home-agent [options]

  Options:
    --token <token>       Relay auth token (from the Agent Home app)
    --url <url>           Relay WebSocket URL
    --name <name>         Agent display name (default: directory name)
    --id <id>             Agent ID (default: derived from name)
    --description <desc>  Agent description
    --filename <file>     Output filename (default: agent.ts or agent.mjs)
    --no-install          Skip npm install of the SDK
    -y, --yes             Accept all defaults, no prompts (for CI / agents)
    -h, --help            Show this help

  Non-interactive (for coding agents):
    npx create-agent-home-agent \\
      --url "wss://relay.example.com/ws" \\
      --token "eyJhbG..." \\
      --name "My Agent" \\
      --id "my-agent" \\
      --description "Does things" \\
      --yes

  Interactive:
    npx create-agent-home-agent
`);
    process.exit(0);
  }
}

// In --yes mode, never prompt. Otherwise, create readline for interactive use.
let rl;
function ask(question) {
  if (flags.yes) return Promise.resolve('');
  if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, res));
}

function toId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  console.log('\n  🏠 Agent Home — Create Agent\n');

  // --- Gather config ---

  const relayUrl = flags.url || (await ask('  Relay URL (wss://...): ')).trim();
  if (!relayUrl) {
    console.error(
      '  ✗ Relay URL is required. Pass --url <url> or generate a token from the Agent Home app.\n',
    );
    process.exit(1);
  }

  const token = flags.token || (await ask('  Token: ')).trim();
  if (!token) {
    console.error(
      '  ✗ Token is required. Pass --token <token> or generate one from the Agent Home app.\n',
    );
    process.exit(1);
  }

  const defaultName = basename(process.cwd());
  const agentName =
    flags.name || (await ask(`  Agent name [${defaultName}]: `)).trim() || defaultName;

  const defaultId = toId(agentName);
  const agentId = flags.id || (await ask(`  Agent ID [${defaultId}]: `)).trim() || defaultId;

  const agentDescription =
    flags.description || (await ask('  Description (optional): ')).trim() || '';

  if (rl) rl.close();

  // --- Determine output file ---

  const useTs = existsSync(resolve(process.cwd(), 'tsconfig.json'));
  const defaultFilename = useTs ? 'agent.ts' : 'agent.mjs';
  const filename = flags.filename || defaultFilename;

  // --- Generate agent file ---

  const descLine = agentDescription
    ? `\n    description: '${agentDescription.replace(/'/g, "\\'")}',`
    : '';

  const agentFile = `import { AgentHomeClient } from '@kenkaiiii/agent-home-sdk';

const client = new AgentHomeClient({
  relayUrl: '${relayUrl}',
  token: '${token}',
  agent: {
    id: '${agentId}',
    name: '${agentName.replace(/'/g, "\\'")}',${descLine}
  },
});

// ── Sessions (optional) ──────────────────────────────────────────────
// Sessions let your agent expose multiple conversations to Agent Home.
// Remove this section if you only need a single flat chat.
//
// Full docs: https://www.npmjs.com/package/@kenkaiiii/agent-home-sdk#sessions-optional

const sessions = new Map();

function createSession(title) {
  const id = \`session-\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}\`;
  sessions.set(id, { id, title, messages: [] });
  pushSessions();
  return id;
}

function pushSessions() {
  const list = Array.from(sessions.values()).map((s) => ({
    id: s.id,
    title: s.title,
    updatedAt: Date.now(),
  }));
  client.updateSessions(list);
}

// ── Message handler ──────────────────────────────────────────────────

client.onMessage(async (message, stream) => {
  const { content, sessionId } = message;

  if (sessionId) {
    // Existing session — route to the right conversation
    const session = sessions.get(sessionId);
    if (!session) {
      stream.error(\`Session \${sessionId} not found\`);
      return;
    }
    session.messages.push(content);
    // Replace with your agent logic:
    stream.end(\`Echo: \${content}\`);
  } else {
    // New chat — create a session and tag the response with its ID
    const title = content.length > 50 ? content.slice(0, 50) + '...' : content;
    const newSessionId = createSession(title);
    const session = sessions.get(newSessionId);
    session.messages.push(content);
    // Replace with your agent logic:
    stream.end(\`Echo: \${content}\`, { sessionId: newSessionId });
  }
});

client.onConnect(() => {
  console.log('✓ Connected to Agent Home');
  pushSessions(); // push existing sessions on reconnect
});

client.onDisconnect(() => {
  console.log('✗ Disconnected from Agent Home');
});

client.connect();
`;

  const filePath = resolve(process.cwd(), filename);
  if (existsSync(filePath) && !flags.yes) {
    console.error(`  ✗ ${filename} already exists. Use --yes to overwrite.\n`);
    process.exit(1);
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, agentFile);
  console.log(`  ✓ Created ${filename}`);

  // --- Install SDK ---

  if (flags.noInstall) {
    console.log('  ⊘ Skipped SDK install (--no-install)');
  } else {
    let needsInstall = true;
    try {
      const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['@kenkaiiii/agent-home-sdk']) needsInstall = false;
    } catch {
      // No package.json — will need init + install
    }

    if (needsInstall) {
      console.log('  ⟳ Installing @kenkaiiii/agent-home-sdk...');
      try {
        if (!existsSync(resolve(process.cwd(), 'package.json'))) {
          execSync('npm init -y', { stdio: 'ignore' });
        }
        execSync('npm install @kenkaiiii/agent-home-sdk', { stdio: 'ignore' });
        console.log('  ✓ Installed @kenkaiiii/agent-home-sdk');
      } catch {
        console.log('  ⚠ Could not auto-install. Run: npm install @kenkaiiii/agent-home-sdk');
      }
    } else {
      console.log('  ✓ @kenkaiiii/agent-home-sdk already installed');
    }
  }

  // --- Next steps ---

  const runCmd = filename.endsWith('.ts') ? `npx tsx ${filename}` : `node ${filename}`;
  console.log(`\n  ✅ Ready!\n\n    Run: ${runCmd}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
