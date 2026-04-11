import { IsString, IsOptional, IsUUID, IsArray } from 'class-validator';

export class CreateWorkflowDto {
  @IsString({ message: 'Name must be a string' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsUUID('4', { message: 'Invalid application ID' })
  applicationId: string;

  @IsOptional()
  @IsArray({ message: 'Nodes must be an array' })
  nodes?: any[];

  @IsOptional()
  @IsArray({ message: 'Edges must be an array' })
  edges?: any[];

  @IsOptional()
  variables?: Record<string, unknown>;
}
