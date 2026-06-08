/**
 * 工作流模板 DTO
 *
 * Phase 4.3: 模板市场 — 数据传输对象
 */
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

/** 模板分类枚举 */
export enum TemplateCategory {
  PRODUCTIVITY = 'productivity',
  CUSTOMER_SERVICE = 'customer-service',
  CONTENT_CREATION = 'content-creation',
  DATA_ANALYSIS = 'data-analysis',
  EDUCATION = 'education',
  DEVELOPMENT = 'development',
  OTHER = 'other',
}

/** 创建模板 DTO — 从现有工作流发布为模板 */
export class CreateTemplateDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  screenshot?: string;

  @IsEnum(TemplateCategory)
  category!: TemplateCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;

  // 来源工作流 ID（可选，从现有工作流导入）
  @IsOptional()
  @IsString()
  sourceWorkflowId?: string;
}

/** 更新模板 DTO */
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  screenshot?: string;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** 模板查询/筛选 DTO */
export class QueryTemplateDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;

  /** 排序字段: newest, popular, rating */
  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** 评分 DTO */
export class RateTemplateDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;
}

/** 从模板创建工作流 DTO */
export class CreateFromTemplateDto {
  @IsString()
  applicationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
