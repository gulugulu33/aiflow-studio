import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { StreamRunDto, RunDto, ChatDto } from './dto/ai.dto';
import { RAGService } from '../rag/services/rag.service';
import axios from 'axios';

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private ragService: RAGService,
  ) {}

  async run(userId: string, runDto: RunDto) {
    // TODO: 实现非流式工作流运行逻辑
    return {
      success: true,
      message: 'Run completed',
      data: null,
    };
  }

  async streamRun(userId: string, streamRunDto: StreamRunDto, res: Response) {
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      // TODO: 实现流式工作流运行逻辑
      res.write(`data: ${JSON.stringify({ type: 'start', message: 'Stream started' })}\n\n`);
      
      // 模拟流式输出
      res.write(`data: ${JSON.stringify({ type: 'complete', message: 'Stream completed' })}\n\n`);
      
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
      res.end();
    }
  }

  async chat(userId: string, chatDto: ChatDto, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const { message, history = [], sessionId = Date.now().toString(), knowledgeBaseId } = chatDto;
      const apiKey = this.configService.get<string>('QWEN_API_KEY');
      const baseUrl = this.configService.get<string>('QWEN_BASE_URL');

      // 1. 保存用户消息
      await this.prisma.chatHistory.create({
        data: {
          sessionId,
          role: 'user',
          content: message,
          userId,
        },
      });

      let context = '';
      let references: any[] = [];

      // 2. RAG 检索
      if (knowledgeBaseId) {
        references = await this.ragService.retrieve(message, knowledgeBaseId, 5);
        context = references.map((ref: any) => ref.content).join('\n\n');
      }

      // 3. 构建消息
      const messages = [];
      if (context) {
        messages.push({ 
          role: 'system', 
          content: `你是一个基于知识库回答问题的助手。请参考以下内容回答：\n\n${context}` 
        });
      }
      messages.push(...history);
      messages.push({ role: 'user', content: message });

      // 4. 调用 Qwen SSE
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: 'qwen-turbo',
          messages,
          stream: true,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        }
      );

      let fullAssistantContent = '';

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
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
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      response.data.on('end', async () => {
        // 保存助手响应
        await this.prisma.chatHistory.create({
          data: {
            sessionId,
            role: 'assistant',
            content: fullAssistantContent,
            userId,
            references: JSON.stringify(references),
          },
        });
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      });

    } catch (error) {
      console.error('Chat error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
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
