import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, ROOM_LIMITS, type RoomPreviewDto, type RoomSnapshotDto } from '@pmp/shared';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma, RoomPlayerStatus, RoomStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateRoomDto } from './dto/create-room.dto.js';
import type { JoinRoomDto } from './dto/join-room.dto.js';
import type { RoomSettingsInputDto } from './dto/room-settings.dto.js';
import { pickNextHost } from './host-succession.js';
import { RoomCodeGenerator } from './room-code.generator.js';
import { roomNotFound } from './room-code.pipe.js';
import { ROOM_SNAPSHOT_SELECT, toRoomPreviewDto, toRoomSnapshotDto } from './room.mapper.js';

type Tx = Prisma.TransactionClient;

const MAX_CODE_ATTEMPTS = 5;

interface LockedRoom {
  id: string;
  status: RoomStatus;
  maxPlayers: number;
  hostPlayerId: string | null;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: RoomCodeGenerator,
  ) {}

  /** Creates a room; the creator joins as its host using their profile name and avatar. */
  async createRoom(userId: string, dto: CreateRoomDto): Promise<RoomSnapshotDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, avatarId: true },
    });

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const room = await tx.room.create({
            data: {
              code: this.codes.generate(),
              maxPlayers: dto.settings?.maxPlayers ?? ROOM_LIMITS.defaultMaxPlayers,
              roundCount: dto.settings?.roundCount ?? ROOM_LIMITS.defaultRoundCount,
            },
            select: { id: true },
          });
          const host = await tx.roomPlayer.create({
            data: {
              roomId: room.id,
              userId,
              displayName: user.displayName,
              avatarId: user.avatarId,
            },
            select: { id: true },
          });
          await tx.room.update({ where: { id: room.id }, data: { hostPlayerId: host.id } });
          return this.snapshot(tx, room.id, host.id);
        });
      } catch (error) {
        // The only unique value a new room can collide on is its code: retry with a fresh one.
        if (isUniqueViolation(error) && attempt < MAX_CODE_ATTEMPTS) {
          this.logger.warn(`Room code collision (attempt ${attempt}); retrying`);
          continue;
        }
        throw error;
      }
    }
    throw new Error('unreachable');
  }

  async getPreview(code: string): Promise<RoomPreviewDto> {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: {
        code: true,
        status: true,
        maxPlayers: true,
        _count: { select: { players: { where: { status: RoomPlayerStatus.ACTIVE } } } },
      },
    });
    if (!room || room.status === RoomStatus.CLOSED) throw roomNotFound();
    return toRoomPreviewDto({ ...room, playerCount: room._count.players });
  }

  /** Active members only; everyone else gets the same 404 as for an unknown code. */
  async getSnapshot(code: string, userId: string): Promise<RoomSnapshotDto> {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: ROOM_SNAPSHOT_SELECT,
    });
    const viewer = room?.players.find((p) => p.userId === userId);
    if (!room || room.status === RoomStatus.CLOSED || !viewer) throw roomNotFound();
    return toRoomSnapshotDto(room, viewer.id);
  }

  /**
   * Idempotent join. The room row is locked so capacity and name-uniqueness checks
   * cannot race with concurrent joins.
   */
  async join(code: string, userId: string, dto: JoinRoomDto): Promise<RoomSnapshotDto> {
    return this.prisma.$transaction(async (tx) => {
      const room = await this.lockRoom(tx, code);
      const existing = await tx.roomPlayer.findUnique({
        where: { roomId_userId: { roomId: room.id, userId } },
        select: { id: true, status: true },
      });

      if (existing?.status === RoomPlayerStatus.ACTIVE) {
        return this.snapshot(tx, room.id, existing.id);
      }
      if (room.status !== RoomStatus.LOBBY) {
        throw new AppException(
          ErrorCode.GAME_IN_PROGRESS,
          'A game is already in progress in this room.',
          HttpStatus.CONFLICT,
        );
      }

      const activeCount = await tx.roomPlayer.count({
        where: { roomId: room.id, status: RoomPlayerStatus.ACTIVE },
      });
      if (activeCount >= room.maxPlayers) {
        throw new AppException(ErrorCode.ROOM_FULL, 'This room is full.', HttpStatus.CONFLICT);
      }

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { displayName: true, avatarId: true },
      });
      const displayName = dto.displayName ?? user.displayName;
      const avatarId = dto.avatarId ?? user.avatarId;
      await this.assertNameAvailable(tx, room.id, displayName);

      const player = existing
        ? await tx.roomPlayer.update({
            where: { id: existing.id },
            data: {
              status: RoomPlayerStatus.ACTIVE,
              displayName,
              avatarId,
              joinedAt: new Date(),
              leftAt: null,
            },
            select: { id: true },
          })
        : await tx.roomPlayer.create({
            data: { roomId: room.id, userId, displayName, avatarId },
            select: { id: true },
          });

      await tx.room.update({ where: { id: room.id }, data: { lastActivityAt: new Date() } });
      return this.snapshot(tx, room.id, player.id);
    });
  }

  /**
   * Leaves the lobby. A departing host is replaced by the longest-present player;
   * the room closes when nobody is left. Leaving a running game is handled with the
   * game engine (M4) and is rejected until then.
   */
  async leave(code: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const room = await this.lockRoom(tx, code);
      const player = await this.requireActivePlayer(tx, room.id, userId);
      if (room.status !== RoomStatus.LOBBY) {
        throw new AppException(
          ErrorCode.GAME_IN_PROGRESS,
          'You cannot leave while a game is in progress.',
          HttpStatus.CONFLICT,
        );
      }

      const now = new Date();
      await tx.roomPlayer.update({
        where: { id: player.id },
        data: { status: RoomPlayerStatus.LEFT, leftAt: now },
      });

      if (room.hostPlayerId === player.id) {
        const active = await tx.roomPlayer.findMany({
          where: { roomId: room.id, status: RoomPlayerStatus.ACTIVE },
          select: { id: true, joinedAt: true },
        });
        const nextHost = pickNextHost(active, player.id);
        await tx.room.update({
          where: { id: room.id },
          data: nextHost
            ? { hostPlayerId: nextHost.id, lastActivityAt: now }
            : { hostPlayerId: null, status: RoomStatus.CLOSED, lastActivityAt: now },
        });
        return;
      }
      await tx.room.update({ where: { id: room.id }, data: { lastActivityAt: now } });
    });
  }

  async updateSettings(
    code: string,
    userId: string,
    dto: RoomSettingsInputDto,
  ): Promise<RoomSnapshotDto> {
    return this.prisma.$transaction(async (tx) => {
      const room = await this.lockRoom(tx, code);
      const player = await this.requireActivePlayer(tx, room.id, userId);

      if (room.hostPlayerId !== player.id) {
        throw new AppException(
          ErrorCode.NOT_ROOM_HOST,
          'Only the host can change room settings.',
          HttpStatus.FORBIDDEN,
        );
      }
      if (room.status !== RoomStatus.LOBBY) {
        throw new AppException(
          ErrorCode.GAME_IN_PROGRESS,
          'Settings cannot change during a game.',
          HttpStatus.CONFLICT,
        );
      }
      if (dto.maxPlayers !== undefined) {
        const activeCount = await tx.roomPlayer.count({
          where: { roomId: room.id, status: RoomPlayerStatus.ACTIVE },
        });
        if (dto.maxPlayers < activeCount) {
          throw new AppException(
            ErrorCode.ROOM_SETTINGS_CONFLICT,
            `Max players cannot be lower than the ${activeCount} players already in the room.`,
            HttpStatus.CONFLICT,
          );
        }
      }

      await tx.room.update({
        where: { id: room.id },
        data: {
          ...(dto.maxPlayers === undefined ? {} : { maxPlayers: dto.maxPlayers }),
          ...(dto.roundCount === undefined ? {} : { roundCount: dto.roundCount }),
          lastActivityAt: new Date(),
        },
      });
      return this.snapshot(tx, room.id, player.id);
    });
  }

  /** Row lock (SELECT … FOR UPDATE) serialising all membership changes of one room. */
  private async lockRoom(tx: Tx, code: string): Promise<LockedRoom> {
    const rows = await tx.$queryRaw<LockedRoom[]>`
      SELECT "id", "status", "maxPlayers", "hostPlayerId"
      FROM "Room"
      WHERE "code" = ${code} AND "status" <> 'CLOSED'
      FOR UPDATE`;
    const room = rows[0];
    if (!room) throw roomNotFound();
    return room;
  }

  private async requireActivePlayer(
    tx: Tx,
    roomId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const player = await tx.roomPlayer.findFirst({
      where: { roomId, userId, status: RoomPlayerStatus.ACTIVE },
      select: { id: true },
    });
    if (!player) throw roomNotFound();
    return player;
  }

  /** Names must be distinguishable when voting: unique per room, case-insensitive. */
  private async assertNameAvailable(tx: Tx, roomId: string, displayName: string): Promise<void> {
    const clash = await tx.roomPlayer.findFirst({
      where: {
        roomId,
        status: RoomPlayerStatus.ACTIVE,
        displayName: { equals: displayName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) {
      throw new AppException(
        ErrorCode.DISPLAY_NAME_TAKEN,
        'Someone in this room already uses that name. Please choose another.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async snapshot(tx: Tx, roomId: string, viewerPlayerId: string): Promise<RoomSnapshotDto> {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      select: ROOM_SNAPSHOT_SELECT,
    });
    return toRoomSnapshotDto(room, viewerPlayerId);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
