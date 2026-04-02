import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { CreateAppDto } from './dto/create-app.dto';
import { UpdateAppDto } from './dto/update-app.dto';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createAppDto: CreateAppDto) {
    return this.prisma.application.create({
      data: {
        ...createAppDto,
        userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.application.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(userId: string, id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        workflows: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this application');
    }

    return app;
  }

  async update(userId: string, id: string, updateAppDto: UpdateAppDto) {
    const app = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this application');
    }

    return this.prisma.application.update({
      where: { id },
      data: updateAppDto,
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(userId: string, id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.userId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this application');
    }

    await this.prisma.application.delete({
      where: { id },
    });

    return { success: true };
  }

  async publish(userId: string, id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.userId !== userId) {
      throw new ForbiddenException('You do not have permission to publish this application');
    }

    return this.prisma.application.update({
      where: { id },
      data: { status: 'published' },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });
  }

  async unpublish(userId: string, id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.userId !== userId) {
      throw new ForbiddenException('You do not have permission to unpublish this application');
    }

    return this.prisma.application.update({
      where: { id },
      data: { status: 'draft' },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });
  }
}
