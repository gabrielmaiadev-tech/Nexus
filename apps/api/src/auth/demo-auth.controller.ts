import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IsIn } from 'class-validator';
import { Public } from './public.decorator';

class DemoSessionDto {
  @IsIn(['Alice', 'Bruno'])
  name!: 'Alice' | 'Bruno';
}

@Controller('auth')
export class DemoAuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('demo-session')
  async createDemoSession(@Body() body: DemoSessionDto) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('Demo sign-in is disabled in production');
    }

    const user = { id: `demo-${body.name.toLowerCase()}`, name: body.name };
    const accessToken = await this.jwt.signAsync({ sub: user.id, name: user.name });
    return { accessToken, user };
  }
}