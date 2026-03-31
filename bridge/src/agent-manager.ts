import {
  AgentStatus,
  type ChatForward,
  MessageType,
  type SessionDeleteForward,
} from '@agent-home/protocol';
import { nanoid } from 'nanoid';

import type { AgentAdapter } from './agents/base.js';
import { HttpAgent } from './agents/http.js';
import { StdioAgent } from './agents/stdio.js';
import type { AgentConfig } from './config.js';
import type { BridgeConnection } from './connection.js';

/** Tracks the context of an in-flight forward to an agent */
interface ActiveForward {
  messageId: string;
  sessionId?: string;
}

export class AgentManager {
  private agents = new Map<string, AgentAdapter>();
  private connection: BridgeConnection;
  /** Per-agent active forward context — keyed by agentId */
  private activeForwards = new Map<string, ActiveForward>();

  constructor(connection: BridgeConnection) {
    this.connection = connection;

    // Listen for chat forwards from relay
    this.connection.on(MessageType.CHAT_FORWARD, (msg) => {
      const forward = msg as ChatForward;
      this.handleChatForward(forward);
    });

    // Listen for session delete forwards from relay
    this.connection.on(MessageType.SESSION_DELETE_FORWARD, (msg) => {
      const forward = msg as SessionDeleteForward;
      const agent = this.agents.get(forward.agentId);
      if (agent) {
        agent.onSessionDelete?.(forward.sessionId);
      }
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
    agent.onToken((token) => {
      const forward = this.activeForwards.get(agent.id);
      const messageId = forward?.messageId ?? nanoid();
      this.connection.send({
        id: nanoid(),
        type: MessageType.CHAT_STREAM,
        timestamp: Date.now(),
        agentId: agent.id,
        token,
        messageId,
        ...(forward?.sessionId ? { sessionId: forward.sessionId } : {}),
      });
    });

    agent.onResponse((response) => {
      const forward = this.activeForwards.get(agent.id);
      const messageId = forward?.messageId ?? nanoid();
      this.connection.send({
        id: nanoid(),
        type: MessageType.CHAT_STREAM_END,
        timestamp: Date.now(),
        agentId: agent.id,
        messageId,
        content: response,
        ...(forward?.sessionId ? { sessionId: forward.sessionId } : {}),
      });
      this.activeForwards.delete(agent.id);

      // Set agent back to ONLINE
      this.connection.send({
        id: nanoid(),
        type: MessageType.AGENT_STATUS,
        timestamp: Date.now(),
        agentId: agent.id,
        status: AgentStatus.ONLINE,
      });
    });

    agent.onError((error) => {
      console.error(`[agent:${agent.id}] Error:`, error);
      this.activeForwards.delete(agent.id);
      this.connection.send({
        id: nanoid(),
        type: MessageType.ERROR,
        timestamp: Date.now(),
        code: 'AGENT_ERROR',
        message: error,
        agentId: agent.id,
      });

      // Set agent back to ONLINE after error
      this.connection.send({
        id: nanoid(),
        type: MessageType.AGENT_STATUS,
        timestamp: Date.now(),
        agentId: agent.id,
        status: AgentStatus.ONLINE,
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

    // Track the forward context for this agent
    const messageId = nanoid();
    this.activeForwards.set(agent.id, {
      messageId,
      sessionId: forward.sessionId,
    });

    // Set agent to BUSY
    this.connection.send({
      id: nanoid(),
      type: MessageType.AGENT_STATUS,
      timestamp: Date.now(),
      agentId: agent.id,
      status: AgentStatus.BUSY,
    });

    console.log(`[bridge] Forwarding message to ${agent.name}: ${forward.content.slice(0, 50)}...`);
    try {
      await agent.send({
        content: forward.content,
        sessionId: forward.sessionId,
        messageId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[bridge] Failed to send to agent ${agent.id}:`, message);
      this.activeForwards.delete(agent.id);
      this.connection.send({
        id: nanoid(),
        type: MessageType.ERROR,
        timestamp: Date.now(),
        code: 'AGENT_ERROR',
        message,
        agentId: agent.id,
      });

      // Set agent back to ONLINE after error
      this.connection.send({
        id: nanoid(),
        type: MessageType.AGENT_STATUS,
        timestamp: Date.now(),
        agentId: agent.id,
        status: AgentStatus.ONLINE,
      });
    }
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
