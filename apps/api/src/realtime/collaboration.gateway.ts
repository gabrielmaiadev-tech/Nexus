import {
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/collaboration',
  cors: { origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',') },
})
export class CollaborationGateway implements OnGatewayInit<Namespace> {
  private namespace?: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(namespace: Namespace) {
    this.namespace = namespace;
  }

  publishToBoard(boardId: string, event: string, payload: unknown) {
    this.namespace?.to(`board:${boardId}`).emit(event, payload);
  }

  @SubscribeMessage('board:join')
  async joinBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { boardId?: string },
  ) {
    if (!client.data.userId || payload?.boardId !== 'demo') {
      throw new WsException('Board not available');
    }
    await client.join('board:demo');
    return { joined: true, boardId: 'demo' };
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (typeof token !== 'string' || token.length === 0) {
        throw new UnauthorizedException();
      }

      const claims = await this.jwt.verifyAsync<{ sub?: string }>(token, {
        algorithms: ['HS256'],
      });
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        throw new UnauthorizedException();
      }
      client.data.userId = claims.sub;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('sync:ping')
  ping(@ConnectedSocket() client: Socket) {
    if (!client.data.userId) throw new WsException('Unauthorized');
    return { event: 'sync:pong', data: { userId: client.data.userId } };
  }

}