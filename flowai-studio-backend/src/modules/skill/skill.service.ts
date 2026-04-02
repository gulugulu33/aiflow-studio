import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

// 内置工具定义
const BUILTIN_SKILLS = [
  {
    id: 'builtin-time',
    name: '获取当前时间',
    description: '获取当前的日期和时间信息',
    type: 'builtin',
    builtinType: 'time',
    inputSchema: {},
    outputSchema: {
      type: 'object',
      properties: {
        datetime: { type: 'string', description: '当前日期时间' },
        timestamp: { type: 'number', description: '时间戳' },
      },
    },
  },
  {
    id: 'builtin-http',
    name: 'HTTP请求',
    description: '发送HTTP请求到指定URL',
    type: 'builtin',
    builtinType: 'http',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '请求URL' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: '请求方法' },
        headers: { type: 'object', description: '请求头' },
        body: { type: 'object', description: '请求体' },
      },
      required: ['url', 'method'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'number', description: 'HTTP状态码' },
        data: { type: 'object', description: '响应数据' },
        headers: { type: 'object', description: '响应头' },
      },
    },
  },
  {
    id: 'builtin-json',
    name: 'JSON解析',
    description: '解析或序列化JSON数据',
    type: 'builtin',
    builtinType: 'json',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['parse', 'stringify'], description: '操作类型' },
        data: { type: 'string', description: '要解析的JSON字符串' },
        value: { type: 'object', description: '要序列化的对象' },
      },
      required: ['action'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'object', description: '解析结果或序列化后的字符串' },
      },
    },
  },
  {
    id: 'builtin-regex',
    name: '正则匹配',
    description: '使用正则表达式匹配文本',
    type: 'builtin',
    builtinType: 'regex',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要匹配的文本' },
        pattern: { type: 'string', description: '正则表达式' },
        flags: { type: 'string', description: '正则标志' },
      },
      required: ['text', 'pattern'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        matches: { type: 'array', description: '匹配结果' },
        groups: { type: 'object', description: '捕获组' },
      },
    },
  },
];

@Injectable()
export class SkillService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createSkillDto: CreateSkillDto) {
    return this.prisma.skill.create({
      data: {
        ...createSkillDto,
        userId,
        type: 'custom',
        config: createSkillDto.config ? JSON.stringify(createSkillDto.config) : undefined,
        inputSchema: createSkillDto.inputSchema ? JSON.stringify(createSkillDto.inputSchema) : undefined,
        outputSchema: createSkillDto.outputSchema ? JSON.stringify(createSkillDto.outputSchema) : undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        config: true,
        inputSchema: true,
        outputSchema: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.skill.findMany({
      where: { userId, type: 'custom' },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  getBuiltinSkills() {
    return BUILTIN_SKILLS;
  }

  async findOne(userId: string, id: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    if (skill.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this skill');
    }

    return skill;
  }

  async update(userId: string, id: string, updateSkillDto: UpdateSkillDto) {
    const skill = await this.prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    if (skill.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this skill');
    }

    if (skill.type === 'builtin') {
      throw new ForbiddenException('Cannot modify builtin skills');
    }

    return this.prisma.skill.update({
      where: { id },
      data: {
        ...updateSkillDto,
        config: updateSkillDto.config ? JSON.stringify(updateSkillDto.config) : undefined,
        inputSchema: updateSkillDto.inputSchema ? JSON.stringify(updateSkillDto.inputSchema) : undefined,
        outputSchema: updateSkillDto.outputSchema ? JSON.stringify(updateSkillDto.outputSchema) : undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        config: true,
        inputSchema: true,
        outputSchema: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(userId: string, id: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    if (skill.userId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this skill');
    }

    if (skill.type === 'builtin') {
      throw new ForbiddenException('Cannot delete builtin skills');
    }

    await this.prisma.skill.delete({
      where: { id },
    });

    return { success: true };
  }
}
