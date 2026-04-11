import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkillService } from './services/skill.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

@Controller('skill')
@UseGuards(JwtAuthGuard)
export class SkillController {
  constructor(private skillService: SkillService) {}

  // 获取内置工具列表（必须在 :id 路由之前，否则 "builtin" 会被当作 id）
  @Get('builtin/list')
  getBuiltinSkills() {
    return this.skillService.getBuiltinSkills();
  }

  // 创建工具
  @Post()
  createSkill(
    @CurrentUser('userId') userId: string,
    @Body() createSkillDto: CreateSkillDto,
  ) {
    return this.skillService.createSkill(userId, createSkillDto);
  }

  // 获取用户的所有工具
  @Get()
  findSkills(@CurrentUser('userId') userId: string) {
    return this.skillService.findSkills(userId);
  }

  // 获取工具详情
  @Get(':id')
  findSkillById(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.skillService.findSkillById(userId, id);
  }

  // 更新工具
  @Put(':id')
  updateSkill(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() updateSkillDto: UpdateSkillDto,
  ) {
    return this.skillService.updateSkill(userId, id, updateSkillDto);
  }

  // 删除工具
  @Delete(':id')
  deleteSkill(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.skillService.deleteSkill(userId, id);
  }

  // 执行工具
  @Post(':id/execute')
  executeSkill(
    @Param('id') id: string,
    @Body('params') params: Record<string, any>,
  ) {
    return this.skillService.executeSkill(id, params);
  }
}
