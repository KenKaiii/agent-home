export interface AgentAdapter {
  id: string;
  name: string;
  description?: string;
  icon?: string;

  send(message: string): Promise<void>;
  onToken(callback: (token: string) => void): void;
  onResponse(callback: (response: string) => void): void;
  onError(callback: (error: string) => void): void;

  start(): Promise<void>;
  stop(): Promise<void>;
}
