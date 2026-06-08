import { IsObject, IsOptional, IsNumber, IsBoolean, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 工作流执行控制选项
 *
 * Phase 4.1: 超时控制与心跳检测
 */
export class ExecutionControlDto {
  /** 工作流整体超时时间（毫秒），默认 300000 (5分钟)，0 表示不限制 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(3600000) // 最大 1 小时
  workflowTimeoutMs?: number;

  /** 单节点超时时间（毫秒），默认 60000 (1分钟)，0 表示不限制 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(600000) // 最大 10 分钟
  nodeTimeoutMs?: number;

  /** 心跳间隔（毫秒），默认 15000 (15秒)，0 表示关闭心跳 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60000)
  heartbeatIntervalMs?: number;

  /** 节点失败最大重试次数，默认 0 (不重试) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  maxRetries?: number;

  /** 是否在节点失败时继续执行后续无依赖分支（默认 false，失败即中断） */
  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean;
}

export class RunWorkflowDto {
  @IsObject({ message: 'Inputs must be an object' })
  inputs: Record<string, any>;

  @IsOptional()
  sessionId?: string;

  /** 执行控制选项（超时、心跳、重试） */
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutionControlDto)
  control?: ExecutionControlDto;
}
