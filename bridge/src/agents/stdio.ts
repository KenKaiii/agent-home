import { spawn, type ChildProcess } from 'node:child_process';

import type { AgentConfig } from '../config.js';
import type { AgentAdapter } from './base.js';

export class StdioAgent implements AgentAdapter {
  id: string;
  name: string;
  description?: string;
  icon?: string;

  private command: string;
  private args: string[];
  private childProcess: ChildProcess | null = null;
  private tokenCallback: ((token: string) => void) | null = null;
  private responseCallback: ((response: string) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;
  private responseBuffer = '';
  private isProcessing = false;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.icon = config.icon;
    this.command = config.command ?? '';
    this.args = config.args ?? [];
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
    console.log(`[agent:${this.id}] Starting: ${this.command} ${this.args.join(' ')}`);

    this.childProcess = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    // Stream stdout character-by-character
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        // Emit each character as a token for streaming
        for (const char of text) {
          this.tokenCallback?.(char);
        }
        this.responseBuffer += text;
      });
    }

    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        console.error(`[agent:${this.id}] stderr:`, text);
      });
    }

    this.childProcess.on('exit', (code) => {
      console.log(`[agent:${this.id}] Process exited with code ${code}`);
      this.childProcess = null;
    });
  }

  async send(message: string) {
    if (!this.childProcess?.stdin) {
      this.errorCallback?.('Agent process not running');
      return;
    }

    this.responseBuffer = '';
    this.isProcessing = true;

    // Write message to stdin
    this.childProcess.stdin.write(message + '\n');

    // Wait a bit for output to come through, then finalize
    // This is a simplified approach - real agents may need protocol-specific handling
    await this.waitForResponse();

    this.isProcessing = false;
    if (this.responseBuffer) {
      this.responseCallback?.(this.responseBuffer);
      this.responseBuffer = '';
    }
  }

  private waitForResponse(): Promise<void> {
    return new Promise((resolve) => {
      let lastLength = 0;
      let stableCount = 0;

      const check = () => {
        if (this.responseBuffer.length === lastLength) {
          stableCount++;
          if (stableCount >= 3) {
            resolve();
            return;
          }
        } else {
          stableCount = 0;
          lastLength = this.responseBuffer.length;
        }
        setTimeout(check, 500);
      };

      setTimeout(check, 500);
    });
  }

  async stop() {
    if (this.childProcess) {
      console.log(`[agent:${this.id}] Stopping process`);
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
  }
}
