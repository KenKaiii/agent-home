export interface ConnectedApp {
  id: string;
  name: string;
  hostName: string;
  platform: 'macos' | 'linux' | 'windows';
  appVersion: string;
  agentCount: number;
  lastActiveAt: number;
}

export interface Agent {
  id: string;
  appId: string;
  name: string;
  description?: string;
  icon?: string;
  status: 'online' | 'offline' | 'busy';
  lastMessageAt?: number;
  lastMessage?: string;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  createdAt: number;
}
