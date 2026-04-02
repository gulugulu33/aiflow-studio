import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(private prisma: PrismaService) {}

  private serializeWorkflow<T extends { nodes: string; edges: string; variables?: string | null }>(
    workflow: T,
  ) {
    return {
      ...workflow,
      nodes: this.parseJsonField(workflow.nodes, []),
      edges: this.parseJsonField(workflow.edges, []),
      variables: workflow.variables
        ? this.parseJsonField(workflow.variables, {})
        : null,
    };
  }

  private parseJsonField<T>(value: string, fallback: T): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  async create(userId: string, createWorkflowDto: CreateWorkflowDto) {
    const { applicationId, ...data } = createWorkflowDto;

    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this application');
    }

    const workflow = await this.prisma.workflow.create({
      data: {
        ...data,
        applicationId,
        nodes: JSON.stringify(data.nodes || []),
        edges: JSON.stringify(data.edges || []),
        variables: data.variables ? JSON.stringify(data.variables) : undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        nodes: true,
        edges: true,
        variables: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.serializeWorkflow(workflow);
  }

  async findByApp(userId: string, appId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: appId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this application');
    }

    return this.prisma.workflow.findMany({
      where: { applicationId: appId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(userId: string, id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        application: {
          select: { userId: true },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.application.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this workflow');
    }

    const { application, ...workflowData } = workflow;
    return this.serializeWorkflow(workflowData);
  }

  async update(userId: string, id: string, updateWorkflowDto: UpdateWorkflowDto) {
    const existingWorkflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        application: {
          select: { userId: true },
        },
      },
    });

    if (!existingWorkflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (existingWorkflow.application.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this workflow');
    }

    const workflow = await this.prisma.workflow.update({
      where: { id },
      data: {
        ...updateWorkflowDto,
        nodes: updateWorkflowDto.nodes ? JSON.stringify(updateWorkflowDto.nodes) : undefined,
        edges: updateWorkflowDto.edges ? JSON.stringify(updateWorkflowDto.edges) : undefined,
        variables: updateWorkflowDto.variables ? JSON.stringify(updateWorkflowDto.variables) : undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        nodes: true,
        edges: true,
        variables: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.serializeWorkflow(workflow);
  }

  async remove(userId: string, id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        application: {
          select: { userId: true },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.application.userId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this workflow');
    }

    await this.prisma.workflow.delete({
      where: { id },
    });

    return { success: true };
  }
}
