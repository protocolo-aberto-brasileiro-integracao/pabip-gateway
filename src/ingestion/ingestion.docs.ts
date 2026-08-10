import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IngestResponseDto } from './dto/ingest-response.dto';

export function ApiIngestionController() {
  return applyDecorators(ApiTags('image-analytics'), ApiSecurity('ApiKey'));
}

export function ApiIngestEvents() {
  return applyDecorators(
    ApiOperation({
      summary: 'Publish a batch of image-analytics detections',
      description:
        'Protocol §6.1/§6.2 — up to 500 events, up to 1MB. Acceptance is all-or-nothing: the ' +
        'whole batch is accepted or the whole batch is rejected, never a partial result. ' +
        'Delivery to the configured output happens asynchronously after this response.',
    }),
    ApiResponse({
      status: HttpStatus.ACCEPTED,
      description:
        'Batch accepted; acceptedCount reflects the whole batch (all-or-nothing, protocol §6.1).',
      type: IngestResponseDto,
    }),
  );
}
