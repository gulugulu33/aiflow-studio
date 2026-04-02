import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { CreateSkillDto } from '../dto/create-skill.dto';
import { UpdateSkillDto } from '../dto/update-skill.dto';
import { executeBuiltinSkill } from '../utils/builtin-skills';
import axios from 'axios';

@Injectable()
export class SkillService {
  constructor(private prisma: PrismaService) {}

  // 创建工具
  async createSkill(userId: string, createSkillDto: CreateSkillDto) {
    // 检查工具名称是否已存在
    const existingSkill = await this.prisma.skill.findFirst({
      where: { name: createSkillDto.name, userId },
    });

    if (existingSkill) {
      throw new BadRequestException('Skill with this name already exists');
    }

    return this.prisma.skill.create({
      data: {
        name: createSkillDto.name,
        description: createSkillDto.description,
        type: createSkillDto.type,
        builtinType: createSkillDto.builtinType,
        isActive: createSkillDto.isActive,
        userId,
        config: createSkillDto.config ? JSON.stringify(createSkillDto.config) : undefined,
        inputSchema: createSkillDto.inputSchema ? JSON.stringify(createSkillDto.inputSchema) : undefined,
        outputSchema: createSkillDto.outputSchema ? JSON.stringify(createSkillDto.outputSchema) : undefined,
      },
    });
  }

  // 获取用户的所有工具
  async findSkills(userId: string) {
    return this.prisma.skill.findMany({
      where: { userId },
    });
  }

  // 获取工具详情
  async findSkillById(userId: string, id: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    if (skill.userId !== userId) {
      throw new BadRequestException('You do not have permission to access this skill');
    }

    return skill;
  }

  // 更新工具
  async updateSkill(userId: string, id: string, updateSkillDto: UpdateSkillDto) {
    const skill = await this.findSkillById(userId, id);

    return this.prisma.skill.update({
      where: { id },
      data: {
        name: updateSkillDto.name,
        description: updateSkillDto.description,
        type: updateSkillDto.type,
        builtinType: updateSkillDto.builtinType,
        isActive: updateSkillDto.isActive,
        config: updateSkillDto.config ? JSON.stringify(updateSkillDto.config) : undefined,
        inputSchema: updateSkillDto.inputSchema ? JSON.stringify(updateSkillDto.inputSchema) : undefined,
        outputSchema: updateSkillDto.outputSchema ? JSON.stringify(updateSkillDto.outputSchema) : undefined,
      },
    });
  }

  // 删除工具
  async deleteSkill(userId: string, id: string) {
    const skill = await this.findSkillById(userId, id);

    return this.prisma.skill.delete({ where: { id } });
  }

  // 执行工具
  async executeSkill(skillId: string, params: Record<string, any>) {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    if (!skill.isActive) {
      throw new BadRequestException('Skill is not active');
    }

    if (skill.type === 'builtin') {
      return executeBuiltinSkill(skill.builtinType!, params);
    } else {
      // 执行自定义工具
      return this.executeCustomSkill(skill, params);
    }
  }

  // 执行自定义工具
  private async executeCustomSkill(skill: any, params: Record<string, any>) {
    const config = JSON.parse(skill.config || '{}');
    const { url, method = 'POST', headers = {} } = config;

    if (!url) {
      return {
        success: true,
        data: params,
        message: 'Custom skill executed (Echo mode, no URL configured)',
      };
    }

    try {
      const response = await axios({
        url,
        method,
        headers,
        data: params,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      throw new Error(`Custom skill execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 获取内置工具列表
  async getBuiltinSkills() {
    return [
      {
        type: 'time',
        name: '时间工具',
        description: '获取当前时间和日期',
        inputSchema: {},
        outputSchema: {
          datetime: 'string',
          timestamp: 'number',
          date: 'string',
          time: 'string',
        },
      },
      {
        type: 'http',
        name: 'HTTP请求',
        description: '发送HTTP请求',
        inputSchema: {
          url: 'string',
          method: 'string',
          headers: 'object',
          body: 'object',
        },
        outputSchema: {
          status: 'number',
          data: 'any',
          headers: 'object',
        },
      },
      {
        type: 'json',
        name: 'JSON处理',
        description: '解析或生成JSON',
        inputSchema: {
          action: 'string',
          data: 'any',
        },
        outputSchema: {
          result: 'any',
        },
      },
      {
        type: 'regex',
        name: '正则表达式',
        description: '使用正则表达式匹配文本',
        inputSchema: {
          text: 'string',
          pattern: 'string',
          flags: 'string',
        },
        outputSchema: {
          matches: 'array',
          groups: 'object',
        },
      },
    ];
  }
}
