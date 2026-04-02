import { IsString, IsOptional, IsUUID, IsObject } from 'class-validator';

export class CreateWorkflowDto {
  @IsString({ message: 'Name must be a string' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsUUID('4', { message: 'Invalid application ID' })
  applicationId: string;

  @IsOptional()
  @IsObject({ message: 'Nodes must be an object' })
  nodes?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'Edges must be an object' })
  edges?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'Variables must be an object' })
  variables?: Record<string, unknown>;
}
