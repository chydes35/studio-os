import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient, User } from '@repo/db';
import type {
  AuthResponse,
  AuthUser,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { html } from '../notifications/email-html.js';
import { EmailService } from '../notifications/email.service.js';

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Only the hash is stored, so a leaked table can't be replayed. */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    timezone: user.timezone,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  /**
   * Anyone can register a new OWNER account — this is what actually makes
   * auth "real" rather than a login screen bolted onto a still-single-owner
   * backend: every account gets its own independent Clients/Bookings/etc.
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: 'OWNER',
        // Falls back to the column default ('UTC') if the client didn't send one.
        timezone: dto.timezone,
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    return this.buildAuthResponse(user);
  }

  /**
   * Changing a password from inside the app. The current password is required
   * so that someone who walks up to an unlocked browser can't lock the owner
   * out of their own account. Every other session ends; this one is handed a
   * fresh token so the person doing it isn't signed out of the device they
   * are using.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Your current password is incorrect');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        sessionsValidFrom: new Date(),
      },
    });
    // Any outstanding reset link is pointless now, and shouldn't be usable
    // to undo a deliberate password change.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    this.logger.log(`Password changed for user ${userId}`);
    return this.buildAuthResponse(updated);
  }

  /**
   * Ends every session, including the caller's own — that is what the words
   * mean, and it is the useful behaviour when a device was lost. The client
   * clears its token and returns to the sign-in page.
   */
  async signOutEverywhere(userId: string): Promise<{ ok: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionsValidFrom: new Date() },
    });
    this.logger.log(`All sessions ended for user ${userId}`);
    return { ok: true };
  }

  /**
   * Always succeeds, whether or not the address is registered: a different
   * answer for a known address would turn this into a way to enumerate
   * accounts. The caller is rate-limited separately.
   */
  async requestPasswordReset(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return { ok: true };

    // Any older link stops working the moment a new one is issued.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const webAppUrl = this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
    const link = `${webAppUrl}/reset-password?token=${token}`;
    const subject = 'Reset your Studio OS password';
    const body = html`<p>Hi ${user.name},</p><p>Use the link below to choose a new password. It expires in one hour and can only be used once. If you didn't ask for this, you can ignore this email — nothing has changed.</p><p><a href="${link}">${link}</a></p>`;

    const result = await this.email.send({ to: user.email, subject, html: body });
    if (!result.delivered) {
      // Without Resend configured (local dev) nothing is actually sent, so
      // surface the link rather than making the flow untestable. In
      // production the send succeeds and this never runs.
      this.logger.warn(`Password reset email not delivered; link for ${user.email}: ${link}`);
    }
    return { ok: true };
  }

  /**
   * Consumes the token, sets the new password and stamps sessionsValidFrom,
   * which is what invalidates JWTs issued before the reset (see JwtAuthGuard).
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(dto.token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const changedAt = new Date();

    await this.prisma.$transaction([
      // Claim the token: a concurrent second submit finds usedAt already set.
      this.prisma.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: changedAt },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, sessionsValidFrom: changedAt },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: changedAt },
      }),
    ]);

    this.logger.log(`Password reset completed for user ${record.userId}`);
    return { ok: true };
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const accessToken = await this.jwtService.signAsync({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      accessToken,
      user: toAuthUser(user),
    };
  }
}
