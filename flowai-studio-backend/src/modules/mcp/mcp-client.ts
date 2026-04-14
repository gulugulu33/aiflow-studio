import { spawn, ChildProcess } from 'child_process';
import { Logger } from '@nestjs/common';

/**
 * MCP 工具定义
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP 工具调用结果
 */
export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * JSON-RPC 2.0 请求
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, any>;
}

/**
 * JSON-RPC 2.0 响应
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * 轻量级 MCP Client
 * 基于 stdio transport + JSON-RPC 2.0 协议
 */
export class McpClient {
  private readonly logger = new Logger(McpClient.name);
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timer: NodeJS.Timeout;
  }>();
  private buffer = '';
  private connected = false;
  private serverCapabilities: Record<string, any> = {};

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly env: Record<string, string> = {},
  ) {}

  /**
   * 连接到 MCP Server（启动子进程 + 初始化握手）
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.disconnect();
        reject(new Error('MCP Server 连接超时（10秒）'));
      }, 10000);

      try {
        this.process = spawn(this.command, this.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.env },
          shell: true,
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleStdout(data);
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          this.logger.warn(`[MCP stderr] ${data.toString().trim()}`);
        });

        this.process.on('error', (err) => {
          clearTimeout(timeout);
          this.connected = false;
          reject(new Error(`启动 MCP Server 失败: ${err.message}`));
        });

        this.process.on('close', (code) => {
          this.connected = false;
          this.rejectAllPending(new Error(`MCP Server 进程退出 (code: ${code})`));
        });

        // 发送 initialize 请求
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'AiFlow Studio',
            version: '1.0.0',
          },
        }).then((result) => {
          this.serverCapabilities = result.capabilities || {};
          // 发送 initialized 通知
          this.sendNotification('notifications/initialized', {});
          this.connected = true;
          clearTimeout(timeout);
          resolve();
        }).catch((err) => {
          clearTimeout(timeout);
          this.disconnect();
          reject(err);
        });

      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`启动 MCP Server 失败: ${err instanceof Error ? err.message : err}`));
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.rejectAllPending(new Error('Client disconnected'));
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.buffer = '';
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.connected && this.process !== null && !this.process.killed;
  }

  /**
   * 获取服务器能力
   */
  getCapabilities(): Record<string, any> {
    return this.serverCapabilities;
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<McpTool[]> {
    const result = await this.sendRequest('tools/list', {});
    return result.tools || [];
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, any> = {}): Promise<McpToolResult> {
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    return result as McpToolResult;
  }

  /**
   * 发送 JSON-RPC 请求
   */
  private sendRequest(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        return reject(new Error('MCP Server 未连接'));
      }

      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP 请求超时: ${method}`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const message = JSON.stringify(request) + '\n';
      this.process.stdin.write(message);
    });
  }

  /**
   * 发送 JSON-RPC 通知（无需响应）
   */
  private sendNotification(method: string, params: Record<string, any>): void {
    if (!this.process?.stdin?.writable) return;

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  /**
   * 处理 stdout 数据
   */
  private handleStdout(data: Buffer): void {
    this.buffer += data.toString();

    // 按换行符分割，处理完整的 JSON 消息
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // 最后一行可能不完整

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed) as JsonRpcResponse;
        this.handleResponse(message);
      } catch {
        // 跳过非 JSON 输出
        this.logger.debug(`[MCP stdout non-json] ${trimmed}`);
      }
    }
  }

  /**
   * 处理 JSON-RPC 响应
   */
  private handleResponse(message: JsonRpcResponse): void {
    if (message.id === undefined || message.id === null) {
      // 这是服务端发来的通知，忽略
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(`MCP Error [${message.error.code}]: ${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }

  /**
   * 拒绝所有挂起的请求
   */
  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
