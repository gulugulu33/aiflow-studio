/**
 * LLM 模型管理 Controller
 *
 * 提供模型列表、能力查询、健康检查、成本估算等 API
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { LLMModelService } from '../services/llm-model.service';

@Controller('llm')
export class LLMModelController {
  constructor(private readonly llmModelService: LLMModelService) {}

  /**
   * GET /llm/models
   * 获取所有可用模型（按 Provider 分组）
   */
  @Get('models')
  getModels() {
    return this.llmModelService.getModelsGroupByProvider();
  }

  /**
   * GET /llm/models/list
   * 获取所有模型（扁平列表）
   */
  @Get('models/list')
  getAllModels() {
    return this.llmModelService.getAllModels();
  }

  /**
   * GET /llm/models/:modelId
   * 获取指定模型信息
   */
  @Get('models/:modelId')
  getModelInfo(@Param('modelId') modelId: string) {
    return this.llmModelService.getModelInfo(modelId);
  }

  /**
   * GET /llm/health
   * 健康检查所有 LLM Provider
   */
  @Get('health')
  async healthCheck() {
    return this.llmModelService.healthCheck();
  }

  /**
   * GET /llm/cost?modelId=xxx&promptTokens=1000&completionTokens=500
   * 估算 Token 成本
   */
  @Get('cost')
  estimateCost(
    @Query('modelId') modelId: string,
    @Query('promptTokens') promptTokens: string,
    @Query('completionTokens') completionTokens: string,
  ) {
    return this.llmModelService.estimateCost(
      modelId,
      parseInt(promptTokens, 10) || 0,
      parseInt(completionTokens, 10) || 0,
    );
  }

  /**
   * GET /llm/ollama/discover
   * 发现 Ollama 本地模型
   */
  @Get('ollama/discover')
  async discoverOllamaModels() {
    return this.llmModelService.discoverOllamaModels();
  }
}
