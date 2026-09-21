import { Body, Controller, Get, Inject, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaClient } from '@repo/db';
import { loginSchema, registerSchema } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  @Public()
  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema))
    body: ReturnType<typeof registerSchema.parse>,
  ) {
    return this.authService.register(body);
  }

  @Public()
  @Post('login')
  login(
    @Body(new ZodValidationPipe(loginSchema))
    body: ReturnType<typeof loginSchema.parse>,
  ) {
    return this.authService.login(body);
  }

  /** Lets a client re-validate a stored token and refresh its cached user info on app load. */
  @Get('me')
  async me(@Req() req: Request) {
    if (!req.user) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
