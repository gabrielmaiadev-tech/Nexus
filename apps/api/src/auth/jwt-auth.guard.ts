import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';

interface AuthenticatedRequest {
  headers: { authorization?: string };
  user?: { sub: string; [claim: string]: unknown };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    try {
      const claims = await this.jwt.verifyAsync<{ sub?: string }>(token, {
        algorithms: ['HS256'],
      });
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        throw new UnauthorizedException();
      }
      request.user = claims as { sub: string; [claim: string]: unknown };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}