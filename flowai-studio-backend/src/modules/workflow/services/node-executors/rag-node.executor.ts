import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../../types';
import { RAGService } from '../../../rag/services/rag.service';

@Injectable()
export class RAGNodeExecutor implements INodeExecutor {
  constructor(private readonly ragService: RAGService) {}

  async execute(node: any, context: Record<string, any>): Promise<Record<string, any>> {
    const nodeData = node.data as any;
    const { knowledgeBaseId, query, topK, similarityThreshold } = nodeData;

    const resolvedQuery = this.resolveVariables(query, context);

    const documents = await this.ragService.retrieve(resolvedQuery, knowledgeBaseId, topK);

    return { documents };
  }

  private resolveVariables(template: string, context: Record<string, any>): string {
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
