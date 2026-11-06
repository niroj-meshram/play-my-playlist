import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type PublicUserDto } from '@pmp/shared';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import { toPublicUserDto } from './user.mapper.js';

const PUBLIC_USER_SELECT = { id: true, displayName: true, avatarId: true } as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicUser(userId: string): Promise<PublicUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED,
        'Authentication required.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return toPublicUserDto(user);
  }

  /** Updates the profile only. Existing room memberships keep the name they joined with. */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUserDto> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId },
      data: {
        ...(dto.displayName === undefined ? {} : { displayName: dto.displayName }),
        ...(dto.avatarId === undefined ? {} : { avatarId: dto.avatarId }),
      },
    });
    if (count === 0) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED,
        'Authentication required.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.getPublicUser(userId);
  }
}
