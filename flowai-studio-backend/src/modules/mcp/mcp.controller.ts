import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { McpService } from './mcp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('mcp')
@UseGuards(JwtAuthGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  // ========== 服务器 CRUD ==========

  /** 创建 MCP 服务器配置 */
  @Post('servers')
  create(
    @CurrentUser('userId') userId: string,
    @Body() body: {
      name: string;
      description?: string;
      transportType?: 'stdio' | 'sse';
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
    },
  ) {
    return this.mcpService.create(userId, body);
  }

  /** 获取当前用户的所有 MCP 服务器 */
  @Get('servers')
  findAll(@CurrentUser('userId') userId: string) {
    return this.mcpService.findAll(userId);
  }

  /** 获取单个 MCP 服务器详情 */
  @Get('servers/:id')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.mcpService.findOne(userId, id);
  }

  /** 更新 MCP 服务器配置 */
  @Put('servers/:id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      description?: string;
      transportType?: 'stdio' | 'sse';
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      isActive?: boolean;
    },
  ) {
    return this.mcpService.update(userId, id, body);
  }

  /** 删除 MCP 服务器配置 */
  @Delete('servers/:id')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.mcpService.remove(userId, id);
  }

  // ========== 连接管理 ==========

  /** 连接到 MCP Server（启动进程 + 握手 + 获取工具列表） */
  @Post('servers/:id/connect')
  connect(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.mcpService.connectServer(userId, id);
  }

  /** 断开 MCP Server */
  @Post('servers/:id/disconnect')
  disconnect(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.mcpService.disconnectServer(userId, id);
  }

  // ========== 工具操作 ==========

  /** 获取指定服务器的工具列表 */
  @Get('servers/:id/tools')
  listTools(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.mcpService.listTools(userId, id);
  }

  /** 调用 MCP 工具 */
  @Post('servers/:id/tools/call')
  callTool(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() body: { toolName: string; args?: Record<string, any> },
  ) {
    return this.mcpService.callTool(userId, id, body.toolName, body.args || {});
  }

  /** 获取所有已连接服务器的工具（聚合） */
  @Get('tools')
  listAllTools(@CurrentUser('userId') userId: string) {
    return this.mcpService.listAllTools(userId);
  }
}
