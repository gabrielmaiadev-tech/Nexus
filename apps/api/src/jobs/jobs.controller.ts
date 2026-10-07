import { Body, Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IsEmail, IsString, MaxLength } from 'class-validator';

class CreateNotificationDto {
  @IsEmail()
  recipient!: string;

  @IsString()
  @MaxLength(500)
  message!: string;
}

@Controller('jobs')
export class JobsController {
  constructor(@InjectQueue('notifications') private readonly queue: Queue) {}

  @Post('notifications')
  async enqueueNotification(@Body() body: CreateNotificationDto) {
    const job = await this.queue.add('send-notification', body, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return { jobId: job.id, status: 'queued' };
  }
}