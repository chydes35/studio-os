import { Body, Controller, Get, Inject, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaClient } from '@repo/db';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService, toAuthUser } from './auth.service.js';
import { Public } from './public.decorator.js';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../rate-limit/rate-limit.module.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  @Public()
  @Throttle({ default: RATE_LIMITS.register })
  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema))
    body: ReturnType<typeof registerSchema.parse>,
  ) {
    return this.authService.register(body);
  }

  @Public()
  @Throttle({ default: RATE_LIMITS.login })
  @Post('login')
  login(
    @Body(new ZodValidationPipe(loginSchema))
    body: ReturnType<typeof loginSchema.parse>,
  ) {
    return this.authService.login(body);
  }

  /** Always 200, so it can't be used to check whether an address is registered. */
  @Public()
  @Throttle({ default: RATE_LIMITS.forgotPassword })
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    body: ReturnType<typeof forgotPasswordSchema.parse>,
  ) {
    return this.authService.requestPasswordReset(body);
  }

  @Public()
  @Throttle({ default: RATE_LIMITS.resetPassword })
  @Post('reset-password')
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    body: ReturnType<typeof resetPasswordSchema.parse>,
  ) {
    return this.authService.resetPassword(body);
  }

  /** Lets a client re-validate a stored token and refresh its cached user info on app load. */
  @Get('me')
  async me(@Req() req: Request) {
    if (!req.user) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new UnauthorizedException();
    return toAuthUser(user);
  }

  /** Signed-in password change; returns a fresh token for this device. */
  @Throttle({ default: RATE_LIMITS.login })
  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ReturnType<typeof changePasswordSchema.parse>,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.authService.changePassword(req.user.id, body);
  }

  /** Ends every session for this account, this device included. */
  @Post('sign-out-everywhere')
  async signOutEverywhere(@Req() req: Request) {
    if (!req.user) throw new UnauthorizedException();
    return this.authService.signOutEverywhere(req.user.id);
  }

  /** Owner's own settings — currently just the studio time zone used for availability. */
  @Patch('me')
  async updateMe(
    @Req() req: Request,
    @Body(new ZodValidationPipe(updateProfileSchema))
    body: ReturnType<typeof updateProfileSchema.parse>,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const user = await this.prisma.user.update({
      where: { id: req.user.id },
      data: { timezone: body.timezone },
    });
    return toAuthUser(user);
  }
}
