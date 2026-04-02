import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/services/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// 登录尝试记录接口
interface LoginAttempt {
  username: string;
  attempts: number;
  lastAttempt: Date;
  lockedUntil?: Date;
}

// 内存中的登录尝试记录（生产环境应使用Redis）
const loginAttempts = new Map<string, LoginAttempt>();

@Injectable()
export class UserService {
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15分钟

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * 检查账户是否被锁定
   */
  private checkAccountLock(username: string): void {
    const attempt = loginAttempts.get(username);
    
    if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`账户已被锁定，请 ${remainingMinutes} 分钟后再试`);
    }
  }

  /**
   * 记录登录尝试
   */
  private recordLoginAttempt(username: string, success: boolean): void {
    let attempt = loginAttempts.get(username);
    
    if (!attempt) {
      attempt = {
        username,
        attempts: 0,
        lastAttempt: new Date(),
      };
    }

    if (success) {
      // 登录成功，重置尝试记录
      attempt.attempts = 0;
      attempt.lockedUntil = undefined;
    } else {
      // 登录失败，增加尝试次数
      attempt.attempts += 1;
      attempt.lastAttempt = new Date();
      
      // 如果超过最大尝试次数，锁定账户
      if (attempt.attempts >= this.MAX_LOGIN_ATTEMPTS) {
        attempt.lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION);
      }
    }

    loginAttempts.set(username, attempt);
  }

  /**
   * 清理过期的登录尝试记录
   */
  private cleanupExpiredAttempts(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    for (const [username, attempt] of loginAttempts.entries()) {
      if (attempt.lastAttempt < oneHourAgo && !attempt.lockedUntil) {
        loginAttempts.delete(username);
      }
    }
  }

  async register(registerDto: RegisterDto) {
    const { username, password } = registerDto;

    // 输入验证
    if (!username || !password) {
      throw new BadRequestException('用户名和密码不能为空');
    }

    if (username.length < 3 || username.length > 20) {
      throw new BadRequestException('用户名长度必须在3-20个字符之间');
    }

    if (password.length < 6) {
      throw new BadRequestException('密码长度至少为6个字符');
    }

    try {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          username,
        },
      });

      if (existingUser) {
        throw new ConflictException('用户名已存在');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await this.prisma.user.create({
        data: {
          username,
          password: hashedPassword,
        },
        select: {
          id: true,
          username: true,
          createdAt: true,
        },
      });

      return user;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException('注册失败，请稍后重试');
    }
  }

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    // 输入验证
    if (!username || !password) {
      throw new BadRequestException('用户名和密码不能为空');
    }

    // 清理过期记录
    this.cleanupExpiredAttempts();

    // 检查账户是否被锁定
    this.checkAccountLock(username);

    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
      });

      if (!user) {
        this.recordLoginAttempt(username, false);
        throw new UnauthorizedException('用户名或密码错误');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        this.recordLoginAttempt(username, false);
        
        const attempt = loginAttempts.get(username);
        const remainingAttempts = this.MAX_LOGIN_ATTEMPTS - (attempt?.attempts || 0);
        
        throw new UnauthorizedException(
          `用户名或密码错误，剩余尝试次数：${remainingAttempts}`
        );
      }

      // 登录成功
      this.recordLoginAttempt(username, true);

      const payload = { 
        userId: user.id, 
        username: user.username 
      };
      const token = this.jwtService.sign(payload);

      return {
        user: {
          id: user.id,
          username: user.username,
        },
        token,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('登录失败，请稍后重试');
    }
  }

  async getProfile(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          avatar: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('用户不存在');
      }

      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('获取用户信息失败');
    }
  }

  async updateProfile(userId: string, data: { username?: string; avatar?: string }) {
    try {
      return this.prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          username: true,
          avatar: true,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException('更新用户信息失败');
    }
  }
}
