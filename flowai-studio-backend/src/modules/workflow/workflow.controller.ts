import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Subject } from 'rxjs';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutorService } from './services/workflow-executor.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { RunWorkflowDto } from './dto/run-workflow.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly workflowExecutorService: WorkflowExecutorService,
  ) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body() createWorkflowDto: CreateWorkflowDto,
  ) {
    return this.workflowService.create(userId, createWorkflowDto);
  }

  @Get('app/:appId')
  findByApp(
    @CurrentUser('userId') userId: string,
    @Param('appId') appId: string,
  ) {
    return this.workflowService.findByApp(userId, appId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.workflowService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
  ) {
    return this.workflowService.update(userId, id, updateWorkflowDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.workflowService.remove(userId, id);
  }

  @Post(':id/run')
  async run(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() runWorkflowDto: RunWorkflowDto,
  ) {
    // 校验权限等逻辑...
    return this.workflowExecutorService.executeWorkflow(id, runWorkflowDto);
  }

  @Post(':id/run/stream')
  async streamRun(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() runWorkflowDto: RunWorkflowDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sseSubject = new Subject<any>();
    
    sseSubject.subscribe({
      next: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      complete: () => {
        res.end();
      },
      error: (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      },
    });

    try {
      await this.workflowExecutorService.executeWorkflow(id, runWorkflowDto, sseSubject);
      sseSubject.complete();
    } catch (error) {
      sseSubject.error(error);
    }
  }
}
