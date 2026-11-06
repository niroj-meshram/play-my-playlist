import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { PublicUserDto } from '@pmp/shared';
import type { AuthContext } from '../common/auth/auth-context.js';
import { CurrentAuth } from '../common/auth/current-auth.decorator.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentAuth() auth: AuthContext): Promise<PublicUserDto> {
    return this.users.getPublicUser(auth.userId);
  }

  @Patch()
  updateMe(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUserDto> {
    return this.users.updateProfile(auth.userId, dto);
  }
}
