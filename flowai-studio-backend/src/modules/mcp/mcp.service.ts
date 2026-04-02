import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class McpService {
  private tools: Map<string, { 
    name: string; 
    description: string; 
    inputSchema: any;
    handler: (params: Record<string, unknown>) => Promise<unknown> 
  }> = new Map();

  constructor() {
    this.registerBuiltinTools();
  }

  private registerBuiltinTools() {
    // 注册内置MCP工具
    this.tools.set('echo', {
      name: 'echo',
      description: '回显输入的消息',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '要回显的消息' }
        },
        required: ['message']
      },
      handler: async (params: Record<string, unknown>) => {
        return { message: params.message };
      },
    });

    this.tools.set('calculator', {
      name: 'calculator',
      description: '执行基础算术运算',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: '第一个操作数' },
          b: { type: 'number', description: '第二个操作数' },
          operation: { 
            type: 'string', 
            enum: ['add', 'subtract', 'multiply', 'divide'],
            description: '运算符' 
          }
        },
        required: ['a', 'b', 'operation']
      },
      handler: async (params: Record<string, unknown>) => {
        const { a, b, operation } = params as { a: number; b: number; operation: string };
        let result: number;
        switch (operation) {
          case 'add':
            result = a + b;
            break;
          case 'subtract':
            result = a - b;
            break;
          case 'multiply':
            result = a * b;
            break;
          case 'divide':
            if (b === 0) throw new Error('Cannot divide by zero');
            result = a / b;
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
        return { result };
      },
    });
  }

  async getTools() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async invokeTool(userId: string, toolName: string, params: Record<string, unknown>) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new NotFoundException(`Tool ${toolName} not found`);
    }

    try {
      const result = await tool.handler(params);
      return {
        success: true,
        tool: toolName,
        result,
      };
    } catch (error) {
      return {
        success: false,
        tool: toolName,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
