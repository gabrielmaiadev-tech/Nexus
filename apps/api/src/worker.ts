import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Worker } from 'bullmq';

interface NotificationPayload {
  recipient: string;
  message: string;
}

async function bootstrap() {
  const logger = new Logger('NotificationWorker');
  const worker = new Worker<NotificationPayload>(
    'notifications',
    async (job) => {
      logger.log(`Simulated notification ${job.id} for ${job.data.recipient}: ${job.data.message}`);
    },
    {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    },
  );

  worker.on('failed', (job, error) => logger.error(`Job ${job?.id} failed`, error.stack));
  worker.on('error', (error) => logger.error('Worker error', error.stack));

  const shutdown = async () => {
    await worker.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void bootstrap();