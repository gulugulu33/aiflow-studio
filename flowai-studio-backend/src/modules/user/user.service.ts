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
import { RedisService } from '../../common/services/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class UserService {
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60; // 15 分钟（秒）

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  /**
   * 检查账户是否被锁定
   * 使用 Redis 替代内存 Map — 服务重启后锁定状态不丢失
   */
  private async checkAccountLock(username: string): Promise<void> {
    const { locked, remainingMinutes } = await this.redisService.checkAccountLock(username);

    if (locked && remainingMinutes) {
      throw new UnauthorizedException(`账户已被锁定，请 ${remainingMinutes} 分钟后再试`);
    }
  }

  /**
   * 记录登录尝试
   * Redis Key: login_attempts:{username}
   * 过期时间: 1 小时自动清理
   */
  private async recordLoginAttempt(username: string, success: boolean): Promise<number> {
    await this.redisService.recordLoginAttempt(username, success, this.MAX_LOGIN_ATTEMPTS, this.LOCKOUT_DURATION);

    if (success) return 0;

    const { remainingAttempts } = await this.redisService.checkAccountLock(username);
    return remainingAttempts ?? 0;
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

    // 检查账户是否被锁定（Redis 持久化，重启不丢失）
    await this.checkAccountLock(username);

    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
      });

      if (!user) {
        const remaining = await this.recordLoginAttempt(username, false);
        throw new UnauthorizedException(
          `用户名或密码错误，剩余尝试次数：${remaining}`
        );
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        const remaining = await this.recordLoginAttempt(username, false);
        throw new UnauthorizedException(
          `用户名或密码错误，剩余尝试次数：${remaining}`
        );
      }

      // 登录成功，清除尝试记录
      await this.recordLoginAttempt(username, true);

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
