import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async validateUser(identifier: string, password: string): Promise<User> {
    // Look up staff by employeeId, or students by registrationNumber
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await user.validatePassword(password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.identifier, dto.password);

    await this.usersService.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user);
    const hashedRefresh = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.setRefreshToken(user.id, hashedRefresh);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isFirstLogin: user.isFirstLogin,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findOne(userId);
    if (!user?.refreshToken) throw new UnauthorizedException('Access denied');

    const matches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!matches) throw new UnauthorizedException('Access denied');

    const tokens = await this.generateTokens(user);
    const hashedRefresh = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.setRefreshToken(user.id, hashedRefresh);

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshToken(userId, null);
  }

  async forgotPassword(identifier: string): Promise<string> {
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user) return 'If account exists, reset link has been sent'; // No enumeration

    const resetToken = uuidv4();
    const hashedToken = await bcrypt.hash(resetToken, 10);

    await this.userRepository.update(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    return resetToken; // In production, email this token
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const users = await this.userRepository.find({
      where: { passwordResetToken: token !== null ? undefined : null },
    });

    // Find user whose hashed token matches
    let targetUser: User | null = null;
    for (const user of users) {
      if (!user.passwordResetToken || !user.passwordResetExpires) continue;
      if (new Date() > user.passwordResetExpires) continue;
      const matches = await bcrypt.compare(token, user.passwordResetToken);
      if (matches) { targetUser = user; break; }
    }

    if (!targetUser) throw new BadRequestException('Invalid or expired reset token');

    await this.userRepository.update(targetUser.id, {
      passwordHash: await bcrypt.hash(newPassword, 12),
      passwordResetToken: null,
      passwordResetExpires: null,
      isFirstLogin: false,
    });
  }

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findOne(userId);
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.refreshSecret'),
        expiresIn: this.configService.get('jwt.refreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
