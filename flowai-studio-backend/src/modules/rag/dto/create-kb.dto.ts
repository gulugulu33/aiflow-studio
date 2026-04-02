import { IsString, IsOptional, IsNumber, IsIn, Min, Max } from 'class-validator';

export class CreateKnowledgeBaseDto {
  @IsString({ message: 'Name must be a string' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Embedding model must be a string' })
  @IsIn(['text-embedding-v1', 'text-embedding-v2', 'text-embedding-v3'], {
    message: 'Invalid embedding model',
  })
  embeddingModel?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Chunk size must be a number' })
  @Min(100, { message: 'Chunk size must be at least 100' })
  @Max(2000, { message: 'Chunk size must not exceed 2000' })
  chunkSize?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Chunk overlap must be a number' })
  @Min(0, { message: 'Chunk overlap must be at least 0' })
  @Max(500, { message: 'Chunk overlap must not exceed 500' })
  chunkOverlap?: number;

  @IsOptional()
  @IsNumber({}, { message: 'TopK must be a number' })
  @Min(1, { message: 'TopK must be at least 1' })
  @Max(20, { message: 'TopK must not exceed 20' })
  topK?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Similarity threshold must be a number' })
  @Min(0, { message: 'Similarity threshold must be at least 0' })
  @Max(1, { message: 'Similarity threshold must not exceed 1' })
  similarityThreshold?: number;
}
