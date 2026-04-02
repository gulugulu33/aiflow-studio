import { IsObject, IsOptional } from 'class-validator';

export class RunWorkflowDto {
  @IsObject({ message: 'Inputs must be an object' })
  inputs: Record<string, any>;

  @IsOptional()
  sessionId?: string;
}
