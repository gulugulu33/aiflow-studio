import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AiService } from './ai.service';
import { StreamRunDto, RunDto, ChatDto } from './dto/ai.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('run')
  @UseGuards(JwtAuthGuard)
  async run(
    @CurrentUser('userId') userId: string,
    @Body() runDto: RunDto,
  ) {
    return this.aiService.run(userId, runDto);
  }

  @Post('stream-run')
  @UseGuards(JwtAuthGuard)
  async streamRun(
    @CurrentUser('userId') userId: string,
    @Body() streamRunDto: StreamRunDto,
    @Res() res: Response,
  ) {
    await this.aiService.streamRun(userId, streamRunDto, res);
  }

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  async chat(
    @CurrentUser('userId') userId: string,
    @Body() chatDto: ChatDto,
    @Res() res: Response,
  ) {
    await this.aiService.chat(userId, chatDto, res);
  }

  @Get('chat-histories/:sessionId')
  @UseGuards(JwtAuthGuard)
  async getChatHistory(
    @CurrentUser('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.aiService.getChatHistory(userId, sessionId);
  }

  @Get('chat-histories')
  @UseGuards(JwtAuthGuard)
  async getAllChatHistories(
    @CurrentUser('userId') userId: string,
    @Query('appId') appId?: string,
  ) {
    return this.aiService.getAllChatHistories(userId, appId);
  }
}
