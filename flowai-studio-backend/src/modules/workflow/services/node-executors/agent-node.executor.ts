/**
 * Agent 节点执行器
 *
 * 在 Workflow DAG 中作为新的节点类型执行
 * 将 AgentNodeConfig 传递给 AgentExecutorService 执行
 *
 * 支持三种模式:
 * - single: 单 Agent + ReAct 循环
 * - supervisor: Supervisor + Worker 多智能体协调
 * - swarm: 去中心化协作（后续扩展）
 */
import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../../types';
import { AgentExecutorService } from '../../../agent/services/agent-executor.service';
import {
  AgentNodeConfig,
  AgentRunOptions,
} from '../../../agent/interfaces/agent.interface';

@Injectable()
export class AgentNodeExecutor implements INodeExecutor {
  constructor(private readonly agentExecutor: AgentExecutorService) {}

  async execute(
    node: any,
    context: Record<string, any>,
  ): Promise<Record<string, any>> {
    const nodeData = node.data as any;
    const config = this.buildAgentConfig(nodeData);
    const input = this.resolveInput(nodeData.userPrompt, context);

    const options: AgentRunOptions = {
      context,
    };

    const result = await this.agentExecutor.execute(config, input, options);

    return {
      result: result.result,
      messages: result.messages,
      trace: result.trace,
      toolCallCount: result.toolCallCount,
      ragCallCount: result.ragCallCount,
      iterations: result.iterations,
      duration: result.duration,
      success: result.success,
    };
  }

  /**
   * 从节点数据构建 AgentNodeConfig
   */
  private buildAgentConfig(data: any): AgentNodeConfig {
    const mode = data.agentMode || 'single';
    const maxIterations = data.maxIterations || 10;
    const strategy = data.strategy || 'react';

    const config: AgentNodeConfig = {
      mode,
      strategy,
      maxIterations,
      memoryEnabled: data.memoryEnabled ?? false,
      memoryWindowSize: data.memoryWindowSize ?? 10,
    };

    if (mode === 'single') {
      config.singleAgent = {
        id: 'single_agent',
        name: data.label || '智能助手',
        description: data.description || '',
        systemPrompt: data.systemPrompt || '',
        model: data.model || 'qwen-turbo',
        temperature: data.temperature ?? 0.7,
        maxTokens: data.maxTokens ?? 2048,
        toolIds: data.toolIds || [],
        knowledgeBaseIds: data.knowledgeBaseIds || [],
        ragEnabled: data.ragEnabled ?? false,
      };
    } else if (mode === 'supervisor') {
      const workers: any[] = data.workers || [];

      config.supervisor = {
        systemPrompt: data.supervisorPrompt || '',
        model: data.model || 'qwen-plus',
        temperature: data.temperature ?? 0.3,
        maxIterations,
        workers: workers.map((w, i) => ({
          id: w.id || `worker_${i}`,
          name: w.name || `Worker ${i + 1}`,
          description: w.description || '',
          systemPrompt: w.systemPrompt || '',
          model: w.model || data.model || 'qwen-turbo',
          temperature: w.temperature ?? 0.7,
          maxTokens: w.maxTokens ?? 2048,
          toolIds: w.toolIds || [],
          knowledgeBaseIds: w.knowledgeBaseIds || [],
          ragEnabled: w.ragEnabled ?? false,
        })),
      };
    }

    return config;
  }

  /**
   * 解析输入（支持模板变量）
   */
  private resolveInput(template: string, context: Record<string, any>): string {
    if (!template) return '';

    return template.replace(/\{\{(.+?)\}\}/g, (match, p1) => {
      const keys = p1.trim().split('.');
      let value = context;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return match;
        }
      }
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }
}
