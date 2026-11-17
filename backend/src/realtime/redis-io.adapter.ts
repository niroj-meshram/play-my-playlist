import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO server with the Redis adapter, so broadcasts and remote socket operations
 * (replacing a tab, removing a player) reach sockets on every API instance.
 * WebSocket-only transport avoids sticky-session requirements behind a load balancer.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly pub: Redis;
  private readonly sub: Redis;

  constructor(
    app: INestApplicationContext,
    redis: Redis,
    private readonly allowedOrigin: string,
  ) {
    super(app);
    this.pub = redis.duplicate();
    this.sub = redis.duplicate();
  }

  override createIOServer(port: number | undefined, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      cors: { origin: [this.allowedOrigin], credentials: true },
    } as ServerOptions);
    server.adapter(createAdapter(this.pub, this.sub));
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}
