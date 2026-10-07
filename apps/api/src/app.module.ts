import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { HealthController } from './health.controller';
import { JobsController } from './jobs/jobs.controller';
import { CollaborationGateway } from './realtime/collaboration.gateway';
import { BoardController } from './boards/board.controller';
import { BoardService } from './boards/board.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => {
        if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
          throw new Error('JWT_SECRET must contain at least 32 characters');
        }
        return config;
      },
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256' as const,
          issuer: config.get<string>('JWT_ISSUER', 'syncspace-api'),
          audience: config.get<string>('JWT_AUDIENCE', 'syncspace-clients'),
        },
        verifyOptions: {
          algorithms: ['HS256'] as const,
          issuer: config.get<string>('JWT_ISSUER', 'syncspace-api'),
          audience: config.get<string>('JWT_AUDIENCE', 'syncspace-clients'),
        },
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({ name: 'notifications' }),
    AuthModule,
  ],
  controllers: [HealthController, JobsController, BoardController],
  providers: [
    CollaborationGateway,
    BoardService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}