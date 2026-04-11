import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { StreamRunDto, RunDto, ChatDto } from './dto/ai.dto';
import { RAGService } from '../rag/services/rag.service';
import { WorkflowExecutorService } from '../workflow/services/workflow-executor.service';
import { Subject } from 'rxjs';
import axios from 'axios';

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private ragService: RAGService,
    @Inject(forwardRef(() => WorkflowExecutorService))
    private workflowExecutor: WorkflowExecutorService,
  ) {}

  /**
   * Non-streaming workflow run:
   * 1. Find the workflow by appId (or use explicit workflowId)
   * 2. Execute the workflow
   * 3. Return the final context
   */
  async run(userId: string, runDto: RunDto) {
    const workflowId = await this.resolveWorkflowId(userId, runDto.appId, runDto.workflowId);

    const result = await this.workflowExecutor.executeWorkflow(workflowId, {
      inputs: runDto.inputs as Record<string, any>,
      sessionId: runDto.sessionId,
    });

    // Extract output node result if present
    const outputResult = this.extractOutputFromContext(result);

    return {
      success: true,
      message: 'Workflow execution completed',
      data: {
        output: outputResult,
        context: result,
      },
    };
  }

  /**
   * Streaming workflow run via SSE:
   * Pushes real-time node execution status events to the client.
   */
  async streamRun(userId: string, streamRunDto: StreamRunDto, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const workflowId = await this.resolveWorkflowId(userId, streamRunDto.appId, streamRunDto.workflowId);

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

      await this.workflowExecutor.executeWorkflow(workflowId, {
        inputs: streamRunDto.inputs as Record<string, any>,
        sessionId: streamRunDto.sessionId,
      }, sseSubject);

      sseSubject.complete();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
      res.end();
    }
  }

  /**
   * Resolve workflowId: use explicit workflowId if provided,
   * otherwise find the latest workflow for the given appId.
   */
  private async resolveWorkflowId(userId: string, appId: string, workflowId?: string): Promise<string> {
    if (workflowId) {
      return workflowId;
    }

    // Validate app ownership
    const app = await this.prisma.application.findUnique({
      where: { id: appId },
    });

    if (!app) {
      throw new Error('Application not found');
    }

    if (app.userId !== userId) {
      throw new Error('You do not have permission to run this application');
    }

    // Find the latest workflow for this app
    const workflow = await this.prisma.workflow.findFirst({
      where: { applicationId: appId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (!workflow) {
      throw new Error('No workflow found for this application. Please create a workflow first.');
    }

    return workflow.id;
  }

  /**
   * Extract the output from the execution context.
   * Looks for output node results, or returns the last node's result.
   */
  private extractOutputFromContext(context: Record<string, any>): any {
    // Try to find an output node result (key pattern: node with result property)
    for (const [, value] of Object.entries(context)) {
      if (value && typeof value === 'object' && 'result' in value) {
        // Return the last result found
        continue;
      }
    }

    // Return the whole context if no specific output found
    return context;
  }

  async chat(userId: string, chatDto: ChatDto, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const { message, history = [], sessionId = Date.now().toString(), knowledgeBaseId } = chatDto;
      const apiKey = this.configService.get<string>('QWEN_API_KEY');
      const baseUrl = this.configService.get<string>('QWEN_BASE_URL');

      // 1. 保存用户消息（非阻塞，失败不影响对话）
      this.prisma.chatHistory.create({
        data: { sessionId, role: 'user', content: message, userId },
      }).catch((e) => console.error('保存用户消息失败:', e.message));

      let context = '';
      let references: any[] = [];

      // 2. RAG 检索（失败时降级为无知识库模式）
      if (knowledgeBaseId) {
        try {
          references = await this.ragService.retrieve(message, knowledgeBaseId, 5);
          context = references.map((ref: any) => ref.content).join('\n\n');
        } catch (ragError) {
          console.error('RAG 检索失败，降级为普通对话:', ragError.message);
        }
      }

      // 3. 构建消息
      const messages = [];
      if (context) {
        messages.push({
          role: 'system',
          content: `你是一个基于知识库回答问题的助手。请参考以下内容回答：\n\n${context}`,
        });
      }
      messages.push(...history);
      messages.push({ role: 'user', content: message });

      // 4. 调用 Qwen 流式 API
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        { model: 'qwen-turbo', messages, stream: true },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          timeout: 30000,
        },
      );

      let fullAssistantContent = '';

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter((line) => line.trim() !== '');
        for (const line of lines) {
          if (line.includes('[DONE]')) continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices[0]?.delta?.content || '';
              if (content) {
                fullAssistantContent += content;
                res.write(`data: ${JSON.stringify({ type: 'text', content })}\n\n`);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      });

      response.data.on('end', async () => {
        // 保存助手回复（非阻塞）
        this.prisma.chatHistory.create({
          data: {
            sessionId,
            role: 'assistant',
            content: fullAssistantContent,
            userId,
            references: JSON.stringify(references),
          },
        }).catch((e) => console.error('保存助手消息失败:', e.message));

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      });

      response.data.on('error', (err: Error) => {
        console.error('Qwen 流式响应错误:', err.message);
        const safeMsg = (err.message || '流式响应异常').replace(/[\n\r]/g, ' ');
        res.write(`data: ${JSON.stringify({ type: 'error', message: safeMsg })}\n\n`);
        res.end();
      });

    } catch (error) {
      console.error('Chat error:', error);
      const safeMsg = (error instanceof Error ? error.message : 'Unknown error').replace(/[\n\r]/g, ' ');
      res.write(`data: ${JSON.stringify({ type: 'error', message: safeMsg })}\n\n`);
      res.end();
    }
  }

  async chatWithLLM(
    userPrompt: string,
    systemPrompt?: string,
    history: any[] = [],
    model = 'qwen-turbo',
    temperature = 0.7,
    maxTokens = 2048,
  ): Promise<string> {
    const apiKey = this.configService.get<string>('QWEN_API_KEY');
    const baseUrl = this.configService.get<string>('QWEN_BASE_URL');

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push(...history);
    messages.push({ role: 'user', content: userPrompt });

    try {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling LLM API:', error.response?.data || error.message);
      throw new Error('Failed to get response from LLM.');
    }
  }

  async getChatHistory(userId: string, sessionId: string) {
    return this.prisma.chatHistory.findMany({
      where: {
        sessionId,
        userId,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        references: true,
        toolCalls: true,
        createdAt: true,
      },
    });
  }

  async getAllChatHistories(userId: string, appId?: string) {
    const where: { userId: string; metadata?: { path: string[]; equals: string } } = { userId };
    
    if (appId) {
      where.metadata = { path: ['appId'], equals: appId };
    }

    const histories = await this.prisma.chatHistory.groupBy({
      by: ['sessionId'],
      where,
      _max: {
        createdAt: true,
      },
    });

    return histories.map((h: any) => ({
      sessionId: h.sessionId,
      lastMessageAt: h._max.createdAt,
    }));
  }
}
