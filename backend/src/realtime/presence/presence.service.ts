import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayerPresence } from '@pmp/shared';
import type { Redis } from 'ioredis';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { REDIS_CLIENT } from '../../redis/redis.constants.js';
import {
  parseTimerMember,
  PRESENCE_TIMERS_KEY,
  presenceKey,
  socketsKey,
  TimerKind,
  type DueTimer,
} from './presence.keys.js';
import {
  CONNECT_SCRIPT,
  DISCONNECT_SCRIPT,
  EXPIRE_SCRIPT,
  JOIN_SCRIPT,
  REMOVE_SCRIPT,
} from './presence.scripts.js';

export interface ConnectResult {
  /** The socket that owned this player before, if it was a different one (multi-tab). */
  replacedSocketId: string | null;
  /** True when the public presence changed and must be broadcast. */
  presenceChanged: boolean;
}

const EXPIRE_TARGET: Record<TimerKind, PlayerPresence> = {
  [TimerKind.RECONNECTING]: PlayerPresence.RECONNECTING,
  [TimerKind.AWAY]: PlayerPresence.AWAY,
};

const VALID_PRESENCE = new Set<string>(Object.values(PlayerPresence));

/**
 * Player presence and socket ownership, stored in Redis so every API instance agrees.
 * Player identity is (room, player); socket IDs are only used to detect replaced tabs.
 */
@Injectable()
export class PresenceService {
  private readonly graceMs: number;
  private readonly debounceMs: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.graceMs = config.get('PRESENCE_GRACE_MS', { infer: true });
    this.debounceMs = config.get('PRESENCE_DEBOUNCE_MS', { infer: true });
  }

  async connect(roomId: string, playerId: string, socketId: string): Promise<ConnectResult> {
    const [previousSocket, previousPresence] = (await this.redis.eval(
      CONNECT_SCRIPT,
      3,
      ...this.keys(roomId),
      playerId,
      roomId,
      socketId,
    )) as [string, string];
    return {
      replacedSocketId: previousSocket && previousSocket !== socketId ? previousSocket : null,
      presenceChanged: previousPresence !== PlayerPresence.ONLINE,
    };
  }

  /** Returns false when this socket no longer owns the player (it was replaced or removed). */
  async disconnect(roomId: string, playerId: string, socketId: string): Promise<boolean> {
    const now = Date.now();
    const applied = await this.redis.eval(
      DISCONNECT_SCRIPT,
      3,
      ...this.keys(roomId),
      playerId,
      roomId,
      socketId,
      now + this.debounceMs,
      now + this.graceMs,
    );
    return applied === 1;
  }

  async markJoined(roomId: string, playerId: string): Promise<void> {
    const now = Date.now();
    await this.redis.eval(
      JOIN_SCRIPT,
      3,
      ...this.keys(roomId),
      playerId,
      roomId,
      now + this.debounceMs,
      now + this.graceMs,
    );
  }

  /** Clears the player's presence and timers. Returns the socket that owned them, if any. */
  async remove(roomId: string, playerId: string): Promise<string | null> {
    const socket = (await this.redis.eval(
      REMOVE_SCRIPT,
      3,
      ...this.keys(roomId),
      playerId,
      roomId,
    )) as string;
    return socket || null;
  }

  /** Applies an expired timer; returns the new presence, or null when nothing changed. */
  async expire(timer: DueTimer): Promise<PlayerPresence | null> {
    const target = EXPIRE_TARGET[timer.kind];
    const changed = await this.redis.eval(
      EXPIRE_SCRIPT,
      3,
      ...this.keys(timer.roomId),
      timer.playerId,
      timer.roomId,
      target,
    );
    return changed === 1 ? target : null;
  }

  async getPresence(roomId: string, playerId: string): Promise<PlayerPresence> {
    return toPresence(await this.redis.hget(presenceKey(roomId), playerId));
  }

  /** Presence of several players in one round trip. Unknown players are AWAY. */
  async getMany(
    roomId: string,
    playerIds: readonly string[],
  ): Promise<Map<string, PlayerPresence>> {
    if (playerIds.length === 0) return new Map();
    const values = await this.redis.hmget(presenceKey(roomId), ...playerIds);
    return new Map(playerIds.map((id, index) => [id, toPresence(values[index] ?? null)]));
  }

  /**
   * Claims due timers. Every instance may call this concurrently: a timer is returned
   * only to the caller whose ZREM removed it, so each one is processed exactly once.
   */
  async claimDue(now: number, limit = 100): Promise<DueTimer[]> {
    const members = await this.redis.zrangebyscore(
      PRESENCE_TIMERS_KEY,
      '-inf',
      now,
      'LIMIT',
      0,
      limit,
    );
    const claimed: DueTimer[] = [];
    for (const member of members) {
      if ((await this.redis.zrem(PRESENCE_TIMERS_KEY, member)) !== 1) continue;
      const timer = parseTimerMember(member);
      if (timer) claimed.push(timer);
    }
    return claimed;
  }

  private keys(roomId: string): [string, string, string] {
    return [socketsKey(roomId), presenceKey(roomId), PRESENCE_TIMERS_KEY];
  }
}

function toPresence(value: string | null): PlayerPresence {
  return value && VALID_PRESENCE.has(value) ? (value as PlayerPresence) : PlayerPresence.AWAY;
}
