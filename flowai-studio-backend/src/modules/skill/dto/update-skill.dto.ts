import { IsString, IsOptional, IsBoolean, IsObject, IsEnum } from 'class-validator';
import { SkillType } from './create-skill.dto';

export class UpdateSkillDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(SkillType)
  @IsOptional()
  type?: SkillType;

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
