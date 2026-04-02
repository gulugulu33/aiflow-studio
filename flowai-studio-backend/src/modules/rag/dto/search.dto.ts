import { IsString, IsUUID, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class SearchDto {
  @IsUUID('4', { message: 'Invalid knowledge base ID' })
  knowledgeBaseId: string;

  @IsString({ message: 'Query must be a string' })
  query: string;

  @IsOptional()
  @IsNumber({}, { message: 'TopK must be a number' })
  @Min(1, { message: 'TopK must be at least 1' })
  @Max(20, { message: 'TopK must not exceed 20' })
  topK?: number;
}
