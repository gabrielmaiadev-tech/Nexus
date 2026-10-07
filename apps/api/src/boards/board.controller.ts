import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { IsIn, IsInt, IsString, MaxLength, Min } from 'class-validator';
import { BoardColumn, BoardService } from './board.service';
import { CollaborationGateway } from '../realtime/collaboration.gateway';

class MoveCardDto {
  @IsIn(['backlog', 'in-progress', 'done'])
  column!: BoardColumn;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

class CreateCardDto {
  @IsString()
  @MaxLength(100)
  title!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsIn(['backlog', 'in-progress', 'done'])
  column!: BoardColumn;
}

interface AuthenticatedRequest {
  user: { sub: string; name?: string };
}

@Controller('boards')
export class BoardController {
  constructor(
    private readonly boards: BoardService,
    private readonly gateway: CollaborationGateway,
  ) {}

  @Get(':boardId')
  getBoard(@Param('boardId') boardId: string) {
    if (boardId !== 'demo') throw new NotFoundException('Board not found');
    return this.boards.getBoard();
  }

  @Patch(':boardId/cards/:cardId')
  moveCard(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() body: MoveCardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (boardId !== 'demo') throw new NotFoundException('Board not found');
    const result = this.boards.moveCard(
      cardId,
      body.column,
      body.expectedVersion,
      request.user.name ?? request.user.sub,
    );
    this.gateway.publishToBoard('demo', 'board:updated', result);
    return result;
  }

  @Post(':boardId/cards')
  createCard(
    @Param('boardId') boardId: string,
    @Body() body: CreateCardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (boardId !== 'demo') throw new NotFoundException('Board not found');
    const result = this.boards.createCard(body, request.user.name ?? request.user.sub);
    this.gateway.publishToBoard('demo', 'board:updated', result);
    return result;
  }
}