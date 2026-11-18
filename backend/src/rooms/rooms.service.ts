import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  PlayerPresence,
  ROOM_LIMITS,
  type RoomPreviewDto,
  type RoomSnapshotDto,
} from '@pmp/shared';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma, RoomPlayerStatus, RoomStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceService } from '../realtime/presence/presence.service.js';
import { RoomBroadcaster } from '../realtime/room-broadcaster.service.js';
import type { CreateRoomDto } from './dto/create-room.dto.js';
import type { JoinRoomDto } from './dto/join-room.dto.js';
import type { RoomSettingsInputDto } from './dto/room-settings.dto.js';
import { pickNextHost, type HostCandidate } from './host-succession.js';
import { RoomCodeGenerator } from './room-code.generator.js';
import { lockRoomByCode } from './room-lock.js';
import { roomNotFound } from './room-code.pipe.js';
import { ROOM_SNAPSHOT_SELECT, toRoomPreviewDto, toRoomSnapshotDto } from './room.mapper.js';

type Tx = Prisma.TransactionClient;

const MAX_CODE_ATTEMPTS = 5;

export interface RoomMembership {
  roomId: string;
  playerId: string;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: RoomCodeGenerator,
    private readonly presence: PresenceService,
    private readonly broadcaster: RoomBroadcaster,
  ) {}

  /** Creates a room; the creator joins as its host using their profile name and avatar. */
  async createRoom(userId: string, dto: CreateRoomDto): Promise<RoomSnapshotDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, avatarId: true },
    });

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
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
          return { roomId: room.id, playerId: host.id };
        });
        await this.presence.markJoined(created.roomId, created.playerId);
        return await this.snapshot(this.prisma, created.roomId, created.playerId);
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
    return toRoomSnapshotDto(room, viewer.id, await this.presenceOf(room.id, room.players));
  }

  /** Resolves the caller's active membership; anyone else gets the uniform room 404. */
  async getMembership(code: string, userId: string): Promise<RoomMembership> {
    const player = await this.prisma.roomPlayer.findFirst({
      where: {
        userId,
        status: RoomPlayerStatus.ACTIVE,
        room: { code, status: { not: RoomStatus.CLOSED } },
      },
      select: { id: true, roomId: true },
    });
    if (!player) throw roomNotFound();
    return { roomId: player.roomId, playerId: player.id };
  }

  /**
   * Idempotent join. The room row is locked so capacity and name-uniqueness checks
   * cannot race with concurrent joins.
   */
  async join(code: string, userId: string, dto: JoinRoomDto): Promise<RoomSnapshotDto> {
    const { roomId, playerId, joined } = await this.prisma.$transaction(async (tx) => {
      const room = await lockRoomByCode(tx, code);
      const existing = await tx.roomPlayer.findUnique({
        where: { roomId_userId: { roomId: room.id, userId } },
        select: { id: true, status: true },
      });

      if (existing?.status === RoomPlayerStatus.ACTIVE) {
        return { roomId: room.id, playerId: existing.id, joined: false };
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
      return { roomId: room.id, playerId: player.id, joined: true };
    });

    if (joined) await this.presence.markJoined(roomId, playerId);
    const snapshot = await this.snapshot(this.prisma, roomId, playerId);
    const player = snapshot.players.find((p) => p.id === playerId);
    if (joined && player) {
      this.broadcaster.toRoom(roomId, 'room:player-joined', { player });
      this.logger.log(`Player ${playerId} joined room ${roomId}`);
    }
    return snapshot;
  }

  /**
   * Leaves the lobby. A departing host is replaced by the longest-present player;
   * the room closes when nobody is left. Leaving a running game is handled with the
   * game engine (M4) and is rejected until then.
   */
  async leave(code: string, userId: string): Promise<void> {
    const { roomId, playerId, newHostId } = await this.prisma.$transaction(async (tx) => {
      const room = await lockRoomByCode(tx, code);
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
      // A departed player's playlist is private data with no further use.
      await tx.playlist.deleteMany({ where: { roomPlayerId: player.id } });

      if (room.hostPlayerId === player.id) {
        const active = await tx.roomPlayer.findMany({
          where: { roomId: room.id, status: RoomPlayerStatus.ACTIVE },
          select: { id: true, joinedAt: true },
        });
        const nextHost = await this.pickSuccessor(room.id, active, player.id);
        await tx.room.update({
          where: { id: room.id },
          data: nextHost
            ? { hostPlayerId: nextHost.id, lastActivityAt: now }
            : { hostPlayerId: null, status: RoomStatus.CLOSED, lastActivityAt: now },
        });
        return { roomId: room.id, playerId: player.id, newHostId: nextHost?.id ?? null };
      }
      await tx.room.update({ where: { id: room.id }, data: { lastActivityAt: now } });
      return { roomId: room.id, playerId: player.id, newHostId: null };
    });

    await this.presence.remove(roomId, playerId);
    this.broadcaster.removePlayer(roomId, playerId);
    this.broadcaster.toRoom(roomId, 'room:player-left', { playerId });
    if (newHostId)
      this.broadcaster.toRoom(roomId, 'room:host-changed', { hostPlayerId: newHostId });
    this.logger.log(`Player ${playerId} left room ${roomId}`);
  }

  async updateSettings(
    code: string,
    userId: string,
    dto: RoomSettingsInputDto,
  ): Promise<RoomSnapshotDto> {
    const { roomId, playerId } = await this.prisma.$transaction(async (tx) => {
      const room = await lockRoomByCode(tx, code);
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
      return { roomId: room.id, playerId: player.id };
    });

    const snapshot = await this.snapshot(this.prisma, roomId, playerId);
    this.broadcaster.toRoom(roomId, 'room:settings-updated', { settings: snapshot.settings });
    return snapshot;
  }

  /** Longest-present player who is still online; falls back to anyone if all are away. */
  private async pickSuccessor(
    roomId: string,
    active: readonly HostCandidate[],
    departingPlayerId: string,
  ): Promise<HostCandidate | null> {
    const presence = await this.presence.getMany(
      roomId,
      active.map((p) => p.id),
    );
    const online = active.filter((p) => presence.get(p.id) !== PlayerPresence.AWAY);
    return pickNextHost(online, departingPlayerId) ?? pickNextHost(active, departingPlayerId);
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

  private async snapshot(db: Tx, roomId: string, viewerPlayerId: string): Promise<RoomSnapshotDto> {
    const room = await db.room.findUniqueOrThrow({
      where: { id: roomId },
      select: ROOM_SNAPSHOT_SELECT,
    });
    return toRoomSnapshotDto(room, viewerPlayerId, await this.presenceOf(roomId, room.players));
  }

  private presenceOf(
    roomId: string,
    players: readonly { id: string }[],
  ): Promise<Map<string, PlayerPresence>> {
    return this.presence.getMany(
      roomId,
      players.map((p) => p.id),
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
