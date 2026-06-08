/**
 * LLM 模型管理 Service
 *
 * 提供:
 * - 模型列表查询（按 Provider 分组）
 * - 模型能力查询
 * - Provider 健康检查
 * - Token 成本估算
 * - Ollama 本地模型发现
 */
import { Injectable, Logger } from '@nestjs/common';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import {
  LLMModelInfo,
  LLMProviderType,
} from '../interfaces/llm-provider.interface';

@Injectable()
export class LLMModelService {
  private readonly logger = new Logger(LLMModelService.name);

  constructor(private readonly providerFactory: LLMProviderFactory) {}

  /**
   * 获取所有可用模型（按 Provider 分组）
   */
  getModelsGroupByProvider(): Record<string, {
    provider: LLMProviderType;
    description: string;
    models: LLMModelInfo[];
  }> {
    const providerTypes = this.providerFactory.getRegisteredTypes();
    const result: Record<string, {
      provider: LLMProviderType;
      description: string;
      models: LLMModelInfo[];
    }> = {};

    for (const { type, description } of providerTypes) {
      try {
        const provider = this.providerFactory.create(type);
        result[type] = {
          provider: type,
          description,
          models: provider.supportedModels,
        };
      } catch {
        result[type] = {
          provider: type,
          description,
          models: [],
        };
      }
    }

    return result;
  }

  /**
   * 获取所有模型（扁平列表）
   */
  getAllModels(): LLMModelInfo[] {
    return this.providerFactory.getAllModels();
  }

  /**
   * 获取指定模型信息
   */
  getModelInfo(modelId: string): LLMModelInfo | undefined {
    return this.providerFactory.getModelInfo(modelId);
  }

  /**
   * 健康检查所有 Provider
   */
  async healthCheck(): Promise<Record<LLMProviderType, {
    available: boolean;
    models: number;
  }>> {
    return this.providerFactory.healthCheckAll();
  }

  /**
   * 估算 Token 成本
   */
  estimateCost(modelId: string, promptTokens: number, completionTokens: number): {
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    costUSD: number;
  } {
    const cost = this.providerFactory.estimateCost(modelId, promptTokens, completionTokens);
    return {
      modelId,
      promptTokens,
      completionTokens,
      costUSD: cost,
    };
  }

  /**
   * 发现 Ollama 本地模型
   */
  async discoverOllamaModels(): Promise<LLMModelInfo[]> {
    try {
      const provider = this.providerFactory.create('ollama');
      // OllamaProvider 有 discoverLocalModels 方法
      if ('discoverLocalModels' in provider) {
        return await (provider as any).discoverLocalModels();
      }
      return provider.supportedModels;
    } catch {
      this.logger.warn('Failed to discover Ollama models');
      return [];
    }
  }
}
