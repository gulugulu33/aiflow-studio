import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

/**
 * 创建工作流版本快照 DTO
 *
 * Phase 4.2: 版本管理
 */
export class CreateVersionDto {
  /** 版本标签（如 "v1.0 正式发布"） */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  /** 版本说明/变更日志 */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** 是否为发布版本（vs 草稿快照） */
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
