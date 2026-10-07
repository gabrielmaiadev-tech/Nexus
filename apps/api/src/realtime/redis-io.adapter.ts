import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private publisher?: Redis;
  private subscriber?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly env = process.env,
  ) {
    super(app);
  }

  async connectToRedis() {
    const options = {
      host: this.env.REDIS_HOST ?? 'localhost',
      port: Number(this.env.REDIS_PORT ?? 6379),
      password: this.env.REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    };
    this.publisher = new Redis(options);
    this.subscriber = new Redis(options);
    this.publisher.on('error', (error) => console.error(`Redis publisher: ${error.message}`));
    this.subscriber.on('error', (error) => console.error(`Redis subscriber: ${error.message}`));
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    this.adapterConstructor = createAdapter(this.publisher, this.subscriber);
  }

  createIOServer(port: number, options?: Record<string, unknown>): Server {
    const server = super.createIOServer(port, options) as Server;
    if (!this.adapterConstructor) throw new Error('Redis Socket.IO adapter is not connected');
    server.adapter(this.adapterConstructor);
    return server;
  }
}