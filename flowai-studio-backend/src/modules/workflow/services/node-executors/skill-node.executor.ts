import { Injectable } from '@nestjs/common';
import { INodeExecutor } from '../../types';
import { SkillService } from '../../../skill/services/skill.service';

@Injectable()
export class SkillNodeExecutor implements INodeExecutor {
  constructor(private readonly skillService: SkillService) {}

  async execute(node: any, context: Record<string, any>): Promise<Record<string, any>> {
    const nodeData = node.data as any;
    const { skillId, parameters } = nodeData;

    const resolvedParams = this.resolveParameters(parameters, context);

    const result = await this.skillService.executeSkill(skillId, resolvedParams);

    return { result };
  }

  private resolveParameters(params: Record<string, any>, context: Record<string, any>): Record<string, any> {
    const resolvedParams: Record<string, any> = {};
    if (!params) return resolvedParams;
    
    for (const key in params) {
      const value = params[key];
      if (typeof value === 'string') {
        resolvedParams[key] = this.resolveVariables(value, context);
      } else {
        resolvedParams[key] = value;
      }
    }
    return resolvedParams;
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
