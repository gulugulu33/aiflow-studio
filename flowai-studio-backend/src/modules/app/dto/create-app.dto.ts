import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';

export class CreateAppDto {
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Icon must be a string' })
  icon?: string;

  @IsOptional()
  @IsString({ message: 'Status must be a string' })
  @IsIn(['draft', 'published', 'archived'], { message: 'Invalid status value' })
  status?: string;
}
