import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnalyticsBatchDto } from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { IpAllowlistGuard } from '../auth/guards/ip-allowlist.guard';
import { CurrentPeer } from '../auth/decorators/current-peer.decorator';
import type { CachedPeer } from '../peers/peer-cache.service';
import { RateLimiterInterceptor } from '../rate-limiter/rate-limiter.interceptor';
import { IngestResponseDto } from './dto/ingest-response.dto';
import { BatchScopeGuard } from './guards/batch-scope.guard';
import { ApiIngestEvents, ApiIngestionController } from './ingestion.docs';
import { IngestionService } from './ingestion.service';

@ApiIngestionController()
@Controller('image-analytics')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('events')
  @UseGuards(ApiKeyGuard, IpAllowlistGuard, BatchScopeGuard)
  @UseInterceptors(RateLimiterInterceptor)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiIngestEvents()
  ingest(@Body() batch: AnalyticsBatchDto, @CurrentPeer() peer: CachedPeer): IngestResponseDto {
    return this.ingestionService.ingest(batch, peer);
  }
}
