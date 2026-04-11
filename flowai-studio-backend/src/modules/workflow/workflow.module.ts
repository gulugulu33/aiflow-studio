import { Module, forwardRef } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutorService } from './services/workflow-executor.service';
import { NodeExecutorFactory } from './services/node-executor.factory';
import { StartNodeExecutor } from './services/node-executors/start-node.executor';
import { UserInputNodeExecutor } from './services/node-executors/user-input-node.executor';
import { LLMNodeExecutor } from './services/node-executors/llm-node.executor';
import { RAGNodeExecutor } from './services/node-executors/rag-node.executor';
import { SkillNodeExecutor } from './services/node-executors/skill-node.executor';
import { ConditionNodeExecutor } from './services/node-executors/condition-node.executor';
import { OutputNodeExecutor } from './services/node-executors/output-node.executor';
import { PrismaModule } from '../../common/modules/prisma.module';
import { RAGModule } from '../rag/rag.module';
import { SkillModule } from '../skill/skill.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, RAGModule, SkillModule, forwardRef(() => AiModule)],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    WorkflowExecutorService,
    NodeExecutorFactory,
    StartNodeExecutor,
    UserInputNodeExecutor,
    LLMNodeExecutor,
    RAGNodeExecutor,
    SkillNodeExecutor,
    ConditionNodeExecutor,
    OutputNodeExecutor,
  ],
  exports: [WorkflowExecutorService],
})
export class WorkflowModule {}
