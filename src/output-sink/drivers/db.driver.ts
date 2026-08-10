import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/output-sink-prisma/client';
import { registerSecret } from '../../common/logging/secret-redactor';
import { ConfigService } from '../../config/config.service';
import type { DeliveryBatch, OutputSinkDriver } from '../output-sink.interface';

@Injectable()
export class DbDriver implements OutputSinkDriver, OnModuleDestroy {
  private readonly logger = new Logger(DbDriver.name);
  private connectionString?: string;
  private client?: PrismaClient;

  constructor(private readonly configService: ConfigService) {}

  async deliver(batch: DeliveryBatch, peerId: string, batchType: string): Promise<void> {
    const client = this.resolveClient();
    await client.deliveredAnalyticsEvent.createMany({
      data: batch.events.map((event) => ({
        eventId: event.eventId,
        eventTime: new Date(event.eventTime),
        sensorNodeId: event.sensorNodeId,
        partnerName: event.partnerName,
        latitude: event.latitude,
        longitude: event.longitude,
        evidenceUrl: event.evidenceUrl,
        batchId: batch.batchId,
        batchType,
        peerId,
        data: event.data as never,
      })),
      skipDuplicates: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }

  private resolveClient(): PrismaClient {
    const connectionString = this.configService.output.db.connectionString;
    if (!connectionString) {
      throw new Error('output.db.connectionString is not configured; cannot deliver via db.');
    }

    if (this.client && this.connectionString === connectionString) {
      return this.client;
    }

    void this.client?.$disconnect().catch(() => undefined);

    registerSecret(connectionString);
    this.connectionString = connectionString;
    this.client = new PrismaClient({ adapter: new PrismaPg(connectionString) });
    this.logger.log('Connected to the output.type = db destination database.');
    return this.client;
  }
}
