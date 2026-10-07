import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

export type BoardColumn = 'backlog' | 'in-progress' | 'done';

export interface BoardCard {
  id: string;
  title: string;
  description: string;
  assignee: string;
  column: BoardColumn;
}

@Injectable()
export class BoardService {
  private version = 1;
  private readonly cards: BoardCard[] = [
    { id: 'card-1', title: 'Mapear eventos do domínio', description: 'Definir contratos para atualização do quadro', assignee: 'Alice', column: 'backlog' },
    { id: 'card-2', title: 'Configurar Redis Adapter', description: 'Propagar eventos entre instâncias Socket.IO', assignee: 'Bruno', column: 'in-progress' },
    { id: 'card-3', title: 'Criar estrutura do projeto', description: 'NestJS, TypeScript e Compose inicial', assignee: 'Alice', column: 'done' },
    { id: 'card-4', title: 'Adicionar controle de versão', description: 'Detectar atualizações concorrentes', assignee: 'Bruno', column: 'backlog' },
  ];

  getBoard() {
    return { id: 'demo', name: 'SyncSpace launch', version: this.version, cards: this.cards };
  }

  moveCard(cardId: string, column: BoardColumn, expectedVersion: number, actor: string) {
    if (expectedVersion !== this.version) {
      throw new ConflictException({
        message: 'Board changed since it was loaded',
        currentVersion: this.version,
        board: this.getBoard(),
      });
    }

    const card = this.cards.find((item) => item.id === cardId);
    if (!card) throw new NotFoundException('Card not found');
    card.column = column;
    this.version += 1;
    return { board: this.getBoard(), change: { cardId, column, actor } };
  }

  createCard(
    input: Pick<BoardCard, 'title' | 'description' | 'column'>,
    actor: string,
  ) {
    const card: BoardCard = {
      id: `card-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...input,
      assignee: actor,
    };
    this.cards.unshift(card);
    this.version += 1;
    return {
      board: this.getBoard(),
      change: { cardId: card.id, actor, action: 'created' as const },
    };
  }
}