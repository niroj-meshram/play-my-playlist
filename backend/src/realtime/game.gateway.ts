import { Logger, UseInterceptors, UsePipes } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  ErrorCode,
  GAME_NAMESPACE,
  type RoomSnapshotDto,
  type TimePingResponse,
} from '@pmp/shared';
import { HttpStatus } from '@nestjs/common';
import { AccessTokenVerifier } from '../common/auth/access-token.verifier.js';
import { AppException } from '../common/errors/app.exception.js';
import { createValidationPipe } from '../common/http/create-validation-pipe.js';
import { normalizeRoomCode } from '../rooms/room-code.pipe.js';
import { RoomSubscribeDto } from './dto/room-subscribe.dto.js';
import { TimePingDto } from './dto/time-ping.dto.js';
import { RoomBroadcaster } from './room-broadcaster.service.js';
import { RoomSessionService } from './room-session.service.js';
import { playerChannel, roomChannel, type GameNamespace, type GameSocket } from './socket.types.js';
import { WsAckInterceptor } from './ws-ack.interceptor.js';
import { WsRateLimitInterceptor } from './ws-rate-limit.interceptor.js';

/**
 * Socket.IO transport for rooms (docs/architecture.md §9). Authenticates the handshake,
 * validates payloads and delegates; no business rules live here.
 */
@WebSocketGateway({ namespace: GAME_NAMESPACE })
@UseInterceptors(WsAckInterceptor, WsRateLimitInterceptor)
@UsePipes(createValidationPipe())
export class GameGateway implements OnGatewayInit<GameNamespace>, OnGatewayDisconnect<GameSocket> {
  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly verifier: AccessTokenVerifier,
    private readonly sessions: RoomSessionService,
    private readonly broadcaster: RoomBroadcaster,
  ) {}

  afterInit(namespace: GameNamespace): void {
    this.broadcaster.attach(namespace);
    namespace.use((socket, next) => {
      const auth: unknown = socket.handshake.auth;
      const token =
        typeof auth === 'object' && auth !== null ? (auth as { token?: unknown }).token : undefined;
      this.verifier.verify(token).then(
        ({ userId }) => {
          socket.data.userId = userId;
          next();
        },
        () => {
          const error = new Error('Authentication required.') as Error & { data?: unknown };
          error.data = { code: ErrorCode.UNAUTHORIZED };
          next(error);
        },
      );
    });
  }

  async handleDisconnect(socket: GameSocket): Promise<void> {
    const subscription = socket.data.subscription;
    if (!subscription) return;
    try {
      await this.sessions.detach(subscription, socket.id);
    } catch (error) {
      this.logger.error(
        `Failed to process disconnect of player ${subscription.playerId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @SubscribeMessage('room:subscribe')
  async subscribe(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() dto: RoomSubscribeDto,
  ): Promise<RoomSnapshotDto> {
    const roomCode = normalizeRoomCode(dto.roomCode);
    const membership = await this.sessions.resolveMembership(roomCode, socket.data.userId);

    const previous = socket.data.subscription;
    if (previous && previous.playerId !== membership.playerId) {
      await socket.leave(roomChannel(previous.roomId));
      await socket.leave(playerChannel(previous.playerId));
      socket.data.subscription = undefined;
      await this.sessions.detach(previous, socket.id);
    }

    await socket.join([roomChannel(membership.roomId), playerChannel(membership.playerId)]);
    socket.data.subscription = { ...membership, roomCode };
    return this.sessions.attach(membership, roomCode, socket.data.userId, socket.id);
  }

  @SubscribeMessage('sync:request')
  sync(@ConnectedSocket() socket: GameSocket): Promise<RoomSnapshotDto> {
    const subscription = socket.data.subscription;
    if (!subscription) {
      throw new AppException(
        ErrorCode.NOT_SUBSCRIBED,
        'Subscribe to a room first.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.sessions.snapshot(subscription.roomCode, socket.data.userId);
  }

  @SubscribeMessage('time:ping')
  ping(@MessageBody() _dto: TimePingDto): TimePingResponse {
    return { serverTime: Date.now() };
  }
}
