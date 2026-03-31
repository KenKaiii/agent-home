export interface AgentMessage {
  content: string;
  sessionId?: string;
  messageId: string;
}

export interface AgentAdapter {
  id: string;
  name: string;
  description?: string;
  icon?: string;

  send(message: AgentMessage): Promise<void>;
  onToken(callback: (token: string) => void): void;
  onResponse(callback: (response: string) => void): void;
  onError(callback: (error: string) => void): void;

  onSessionDelete?(sessionId: string): void;

  start(): Promise<void>;
  stop(): Promise<void>;
}
