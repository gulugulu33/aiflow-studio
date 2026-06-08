/**
 * Agent 模块
 *
 * Phase 3.1: 多智能体架构
 *
 * 提供:
 * - AgentExecutorService: Agent 执行引擎
 * - LLMProviderService: LLM 调用（含 Function Calling）
 */
import { Module } from '@nestjs/common';
import { AgentExecutorService } from './services/agent-executor.service';
import { LLMProviderService } from './services/llm-provider.service';
import { SkillModule } from '../skill/skill.module';
import { RAGModule } from '../rag/rag.module';
import { PrismaModule } from '../../common/modules/prisma.module';

@Module({
  imports: [SkillModule, RAGModule, PrismaModule],
  providers: [AgentExecutorService, LLMProviderService],
  exports: [AgentExecutorService, LLMProviderService],
})
export class AgentModule {}
