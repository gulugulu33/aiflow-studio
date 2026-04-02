import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { McpService } from './mcp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('mcp')
@UseGuards(JwtAuthGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('tools')
  async getTools() {
    return this.mcpService.getTools();
  }

  @Post('invoke')
  async invokeTool(
    @CurrentUser('userId') userId: string,
    @Body() data: { toolName: string; params: Record<string, unknown> },
  ) {
    return this.mcpService.invokeTool(userId, data.toolName, data.params);
  }
}
