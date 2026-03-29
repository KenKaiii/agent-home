export interface Agent {
  id: string;
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
