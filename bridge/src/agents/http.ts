import type { AgentConfig } from '../config.js';
import type { AgentAdapter, AgentMessage } from './base.js';

export class HttpAgent implements AgentAdapter {
  id: string;
  name: string;
  description?: string;
  icon?: string;

  private url: string;
  private tokenCallback: ((token: string) => void) | null = null;
  private responseCallback: ((response: string) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.icon = config.icon;
    this.url = config.url ?? 'http://localhost:8080';
  }

  onToken(callback: (token: string) => void) {
    this.tokenCallback = callback;
  }

  onResponse(callback: (response: string) => void) {
    this.responseCallback = callback;
  }

  onError(callback: (error: string) => void) {
    this.errorCallback = callback;
  }

  async start() {
    console.log(`[agent:${this.id}] HTTP agent ready at ${this.url}`);
  }

  async send(message: AgentMessage) {
    try {
      const response = await fetch(`${this.url}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.content,
          sessionId: message.sessionId,
          messageId: message.messageId,
        }),
      });

      if (!response.ok) {
        this.errorCallback?.(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      // Check for SSE streaming
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream')) {
        await this.handleSSE(response);
      } else {
        const data = await response.json();
        const content = data.response ?? data.content ?? JSON.stringify(data);
        this.responseCallback?.(content);
      }
    } catch (err) {
      this.errorCallback?.(
        `Failed to reach agent: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async handleSSE(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.token ?? parsed.content ?? parsed.text ?? '';
            if (token) {
              this.tokenCallback?.(token);
              fullContent += token;
            }
          } catch {
            // Plain text token
            this.tokenCallback?.(data);
            fullContent += data;
          }
        }
      }
    }

    if (fullContent) {
      this.responseCallback?.(fullContent);
    }
  }

  async stop() {
    console.log(`[agent:${this.id}] HTTP agent stopped`);
  }
}
