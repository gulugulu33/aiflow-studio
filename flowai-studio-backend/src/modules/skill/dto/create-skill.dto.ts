import { IsString, IsOptional, IsBoolean, IsObject, IsEnum } from 'class-validator';

export enum SkillType {
  BUILTIN = 'builtin',
  CUSTOM = 'custom',
}

export class CreateSkillDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(SkillType)
  type: SkillType;

  @IsString()
  @IsOptional()
  builtinType?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsObject()
  @IsOptional()
  inputSchema?: Record<string, any>;

  @IsObject()
  @IsOptional()
  outputSchema?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
