/**
 * Agent 模块
 *
 * Phase 3.1: 多智能体架构
 * Phase 3.2: 多模型支持
 *
 * 提供:
 * - AgentExecutorService: Agent 执行引擎
 * - LLMProviderFactory: 多模型 Provider 工厂
 * - LLMModelService: 模型管理服务
 * - LLMModelController: 模型管理 API
 */
import { Module } from '@nestjs/common';
import { AgentExecutorService } from './services/agent-executor.service';
import { LLMModelService } from './services/llm-model.service';
import { LLMProviderFactory } from './providers/llm-provider.factory';
import { LLMModelController } from './controllers/llm-model.controller';
import { SkillModule } from '../skill/skill.module';
import { RAGModule } from '../rag/rag.module';
import { PrismaModule } from '../../common/modules/prisma.module';

@Module({
  imports: [SkillModule, RAGModule, PrismaModule],
  controllers: [LLMModelController],
  providers: [AgentExecutorService, LLMModelService, LLMProviderFactory],
  exports: [AgentExecutorService, LLMModelService, LLMProviderFactory],
})
export class AgentModule {}
