import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { ConcurrencyLimiter } from './concurrency-limiter';
import { CallbackDriver } from './drivers/callback.driver';
import { DbDriver } from './drivers/db.driver';
import { KafkaQueueDriver } from './drivers/queue/kafka.driver';
import { RabbitmqQueueDriver } from './drivers/queue/rabbitmq.driver';
import { RedisStreamsQueueDriver } from './drivers/queue/redis-streams.driver';
import { SqsQueueDriver } from './drivers/queue/sqs.driver';
import { QueueDriver } from './drivers/queue.driver';
import { OutputSinkService } from './output-sink.service';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [
    OutputSinkService,
    ConcurrencyLimiter,
    CallbackDriver,
    QueueDriver,
    RabbitmqQueueDriver,
    KafkaQueueDriver,
    SqsQueueDriver,
    RedisStreamsQueueDriver,
    DbDriver,
  ],
  exports: [OutputSinkService],
})
export class OutputSinkModule {}
