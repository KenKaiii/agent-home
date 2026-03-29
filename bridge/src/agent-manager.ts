import {
  MessageType,
  type ChatForward,
} from '@agent-home/protocol';
import { nanoid } from 'nanoid';

import type { AgentAdapter } from './agents/base.js';
import { HttpAgent } from './agents/http.js';
import { StdioAgent } from './agents/stdio.js';
import type { AgentConfig } from './config.js';
import type { BridgeConnection } from './connection.js';

export class AgentManager {
  private agents = new Map<string, AgentAdapter>();
  private connection: BridgeConnection;

  constructor(connection: BridgeConnection) {
    this.connection = connection;

    // Listen for chat forwards from relay
    this.connection.on(MessageType.CHAT_FORWARD, (msg) => {
      const forward = msg as ChatForward;
      this.handleChatForward(forward);
    });
  }

  async startAgent(config: AgentConfig) {
    let agent: AgentAdapter;

    if (config.type === 'stdio') {
      agent = new StdioAgent(config);
    } else {
      agent = new HttpAgent(config);
    }

    // Wire up streaming callbacks
    const streamingMessageId = { current: '' };

    agent.onToken((token) => {
      if (!streamingMessageId.current) {
        streamingMessageId.current = nanoid();
      }
      this.connection.send({
        id: nanoid(),
        type: MessageType.CHAT_STREAM,
        timestamp: Date.now(),
        agentId: agent.id,
        token,
        messageId: streamingMessageId.current,
      });
    });

    agent.onResponse((response) => {
      const messageId = streamingMessageId.current || nanoid();
      this.connection.send({
        id: nanoid(),
        type: MessageType.CHAT_STREAM_END,
        timestamp: Date.now(),
        agentId: agent.id,
        messageId,
        content: response,
      });
      streamingMessageId.current = '';
    });

    agent.onError((error) => {
      console.error(`[agent:${agent.id}] Error:`, error);
      this.connection.send({
        id: nanoid(),
        type: MessageType.ERROR,
        timestamp: Date.now(),
        code: 'AGENT_ERROR',
        message: error,
      });
    });

    await agent.start();
    this.agents.set(agent.id, agent);

    // Register with relay
    this.connection.send({
      id: nanoid(),
      type: MessageType.AGENT_REGISTER,
      timestamp: Date.now(),
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
      },
    });

    console.log(`[bridge] Agent registered: ${agent.name} (${agent.id})`);
  }

  async startAll(configs: AgentConfig[]) {
    for (const config of configs) {
      await this.startAgent(config);
    }
    this.connection.setAgentIds(Array.from(this.agents.keys()));
  }

  private async handleChatForward(forward: ChatForward) {
    const agent = this.agents.get(forward.agentId);
    if (!agent) {
      console.error(`[bridge] Agent not found: ${forward.agentId}`);
      return;
    }

    console.log(`[bridge] Forwarding message to ${agent.name}: ${forward.content.slice(0, 50)}...`);
    await agent.send(forward.content);
  }

  async stopAll() {
    for (const [id, agent] of this.agents) {
      this.connection.send({
        id: nanoid(),
        type: MessageType.AGENT_UNREGISTER,
        timestamp: Date.now(),
        agentId: id,
      });
      await agent.stop();
    }
    this.agents.clear();
  }
}
