import { Module } from '@nestjs/common';
import { DemoAuthController } from './demo-auth.controller';

@Module({ controllers: [DemoAuthController] })
export class AuthModule {}