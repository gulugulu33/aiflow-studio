import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkillService } from './services/skill.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { ApiResponse } from '../../common/types/api-response.type';

@Controller('skill')
export class SkillController {
  constructor(private skillService: SkillService) {}

  // 创建工具
  @UseGuards(JwtAuthGuard)
  @Post()
  async createSkill(
    @Req() req: any,
    @Body() createSkillDto: CreateSkillDto,
  ): Promise<ApiResponse<any>> {
    const skill = await this.skillService.createSkill(req.user.id, createSkillDto);
    return {
      success: true,
      message: 'Skill created successfully',
      data: skill,
    };
  }

  // 获取用户的所有工具
  @UseGuards(JwtAuthGuard)
  @Get()
  async findSkills(@Req() req: any): Promise<ApiResponse<any[]>> {
    const skills = await this.skillService.findSkills(req.user.id);
    return {
      success: true,
      message: 'Skills fetched successfully',
      data: skills,
    };
  }

  // 获取工具详情
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findSkillById(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<ApiResponse<any>> {
    const skill = await this.skillService.findSkillById(req.user.id, id);
    return {
      success: true,
      message: 'Skill fetched successfully',
      data: skill,
    };
  }

  // 更新工具
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateSkill(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateSkillDto: UpdateSkillDto,
  ): Promise<ApiResponse<any>> {
    const skill = await this.skillService.updateSkill(req.user.id, id, updateSkillDto);
    return {
      success: true,
      message: 'Skill updated successfully',
      data: skill,
    };
  }

  // 删除工具
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteSkill(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<ApiResponse<any>> {
    await this.skillService.deleteSkill(req.user.id, id);
    return {
      success: true,
      message: 'Skill deleted successfully',
    };
  }

  // 执行工具
  @UseGuards(JwtAuthGuard)
  @Post(':id/execute')
  async executeSkill(
    @Param('id') id: string,
    @Body('params') params: Record<string, any>,
  ): Promise<ApiResponse<any>> {
    const result = await this.skillService.executeSkill(id, params);
    return {
      success: true,
      message: 'Skill executed successfully',
      data: result,
    };
  }

  // 获取内置工具列表
  @UseGuards(JwtAuthGuard)
  @Get('builtin/list')
  async getBuiltinSkills(): Promise<ApiResponse<any[]>> {
    const skills = await this.skillService.getBuiltinSkills();
    return {
      success: true,
      message: 'Builtin skills fetched successfully',
      data: skills,
    };
  }
}
