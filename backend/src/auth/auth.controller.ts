import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { AccessTokenResponse } from '@pmp/shared';
import type { Request, Response } from 'express';
import { CsrfHeaderGuard } from '../common/auth/csrf-header.guard.js';
import { Public } from '../common/auth/public.decorator.js';
import { RATE_LIMITS } from '../common/throttling/rate-limits.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { AuthService, type SessionGrant } from './auth.service.js';
import { GuestSessionDto } from './dto/guest-session.dto.js';
import { REFRESH_COOKIE, refreshCookieOptions } from './refresh-cookie.js';

@Public()
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secureCookies = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** Creates an anonymous guest identity and session. */
  @Post('guest')
  @Throttle({ default: RATE_LIMITS.createGuest })
  async createGuest(
    @Body() dto: GuestSessionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    return this.respond(res, await this.auth.createGuestSession(dto));
  }

  /** Exchanges the refresh cookie for a new access token (rotating the cookie). */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfHeaderGuard)
  @Throttle({ default: RATE_LIMITS.refreshSession })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    try {
      return this.respond(res, await this.auth.refresh(readRefreshCookie(req)));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.secureCookies));
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfHeaderGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.secureCookies));
  }

  private respond(res: Response, grant: SessionGrant): AccessTokenResponse {
    if (grant.refreshToken) {
      res.cookie(
        REFRESH_COOKIE,
        grant.refreshToken,
        refreshCookieOptions(this.secureCookies, grant.refreshTokenMaxAgeMs),
      );
    }
    res.setHeader('Cache-Control', 'no-store');
    return grant.response;
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}
