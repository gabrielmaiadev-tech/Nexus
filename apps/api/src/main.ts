import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());

  app.setGlobalPrefix('api');
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();