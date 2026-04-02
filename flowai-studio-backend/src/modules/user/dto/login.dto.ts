import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Username must be a string' })
  @MinLength(1, { message: 'Username is required' })
  username: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(1, { message: 'Password is required' })
  password: string;
}
