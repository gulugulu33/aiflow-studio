import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../types';
import { StartNodeExecutor } from './node-executors/start-node.executor';
import { LLMNodeExecutor } from './node-executors/llm-node.executor';
import { RAGNodeExecutor } from './node-executors/rag-node.executor';
import { SkillNodeExecutor } from './node-executors/skill-node.executor';
import { ConditionNodeExecutor } from './node-executors/condition-node.executor';
import { OutputNodeExecutor } from './node-executors/output-node.executor';
import { UserInputNodeExecutor } from './node-executors/user-input-node.executor';

@Injectable()
export class NodeExecutorFactory {
  private executors: Map<string, INodeExecutor> = new Map();

  constructor(
    private readonly startNodeExecutor: StartNodeExecutor,
    private readonly llmNodeExecutor: LLMNodeExecutor,
    private readonly ragNodeExecutor: RAGNodeExecutor,
    private readonly skillNodeExecutor: SkillNodeExecutor,
    private readonly conditionNodeExecutor: ConditionNodeExecutor,
    private readonly outputNodeExecutor: OutputNodeExecutor,
    private readonly userInputNodeExecutor: UserInputNodeExecutor,
  ) {
    this.executors.set('start', this.startNodeExecutor);
    this.executors.set('llm', this.llmNodeExecutor);
    this.executors.set('rag', this.ragNodeExecutor);
    this.executors.set('skill', this.skillNodeExecutor);
    this.executors.set('condition', this.conditionNodeExecutor);
    this.executors.set('output', this.outputNodeExecutor);
    this.executors.set('userInput', this.userInputNodeExecutor);
  }

  getExecutor(nodeType: string): INodeExecutor {
    const executor = this.executors.get(nodeType);
    if (!executor) {
      throw new Error(`No executor found for node type: ${nodeType}`);
    }
    return executor;
  }
}
