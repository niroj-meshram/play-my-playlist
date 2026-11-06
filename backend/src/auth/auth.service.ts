import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, type AccessTokenResponse } from '@pmp/shared';
import { AppException } from '../common/errors/app.exception.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPublicUserDto } from '../users/user.mapper.js';
import type { GuestSessionDto } from './dto/guest-session.dto.js';
import {
  decideRefresh,
  hashRefreshToken,
  issueRefreshToken,
  parseRefreshToken,
} from './refresh-token.js';

const DAY_MS = 86_400_000;

export interface SessionGrant {
  response: AccessTokenResponse;
  /** New refresh token to store in the cookie; absent when the cookie must stay unchanged. */
  refreshToken?: string;
  refreshTokenMaxAgeMs: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  get refreshTokenMaxAgeMs(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * DAY_MS;
  }

  async createGuestSession(dto: GuestSessionDto): Promise<SessionGrant> {
    const refresh = issueRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTokenMaxAgeMs);

    const user = await this.prisma.user.create({
      data: {
        displayName: dto.displayName,
        avatarId: dto.avatarId,
        sessions: { create: { id: refresh.sessionId, refreshTokenHash: refresh.hash, expiresAt } },
      },
      select: { id: true, displayName: true, avatarId: true },
    });

    return {
      response: await this.buildAccessToken(user, refresh.sessionId),
      refreshToken: refresh.token,
      refreshTokenMaxAgeMs: this.refreshTokenMaxAgeMs,
    };
  }

  async refresh(token: string | undefined): Promise<SessionGrant> {
    const parsed = parseRefreshToken(token);
    if (!parsed || !token) throw sessionInvalid();

    const now = new Date();
    const tokenHash = hashRefreshToken(token);
    const session = await this.prisma.authSession.findUnique({
      where: { id: parsed.sessionId },
      include: { user: { select: { id: true, displayName: true, avatarId: true } } },
    });

    switch (decideRefresh(session, tokenHash, now)) {
      case 'ROTATE':
        return this.rotate(session!, tokenHash, now);
      case 'GRACE':
        return {
          response: await this.buildAccessToken(session!.user, session!.id),
          refreshTokenMaxAgeMs: this.refreshTokenMaxAgeMs,
        };
      case 'REUSE_DETECTED':
        await this.revoke(parsed.sessionId);
        this.logger.warn(`Refresh token reuse detected; session ${parsed.sessionId} revoked`);
        throw sessionInvalid();
      case 'REJECT':
        throw sessionInvalid();
    }
  }

  /** Revokes the session behind the cookie, if any. Always succeeds. */
  async logout(token: string | undefined): Promise<void> {
    const parsed = parseRefreshToken(token);
    if (parsed) await this.revoke(parsed.sessionId);
  }

  private async rotate(
    session: { id: string; user: { id: string; displayName: string; avatarId: string } },
    currentHash: string,
    now: Date,
  ): Promise<SessionGrant> {
    const next = issueRefreshToken(session.id);
    // Compare-and-set: only one concurrent request can rotate a given token.
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: session.id, refreshTokenHash: currentHash, revokedAt: null },
      data: {
        refreshTokenHash: next.hash,
        previousTokenHash: currentHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + this.refreshTokenMaxAgeMs),
      },
    });

    if (count === 0) {
      // Lost the race to a concurrent refresh; the winner's cookie is already set.
      return {
        response: await this.buildAccessToken(session.user, session.id),
        refreshTokenMaxAgeMs: this.refreshTokenMaxAgeMs,
      };
    }

    return {
      response: await this.buildAccessToken(session.user, session.id),
      refreshToken: next.token,
      refreshTokenMaxAgeMs: this.refreshTokenMaxAgeMs,
    };
  }

  private async revoke(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async buildAccessToken(
    user: { id: string; displayName: string; avatarId: string },
    sessionId: string,
  ): Promise<AccessTokenResponse> {
    const ttlSeconds = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const accessToken = await this.jwt.signAsync({ sub: user.id, sid: sessionId });
    return {
      accessToken,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      user: toPublicUserDto(user),
    };
  }
}

function sessionInvalid(): AppException {
  return new AppException(
    ErrorCode.SESSION_INVALID,
    'Your session has expired. Please start a new session.',
    HttpStatus.UNAUTHORIZED,
  );
}
