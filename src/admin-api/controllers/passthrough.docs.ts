import { applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

const PASSTHROUGH_NOT_WIRED_DESCRIPTION =
  'The outbound-client module is a later deliverable — every passthrough route ' +
  'is reachable and guarded today, but returns 503 until it lands.';

export function ApiPassthroughController() {
  return applyDecorators(
    ApiTags('peers-passthrough'),
    ApiSecurity('AdminToken'),
    ApiSecurity('ClientToken'),
  );
}

export function ApiListSensorNodes() {
  return applyDecorators(
    ApiOperation({
      summary: 'List a peer’s sensor nodes',
      description: 'Stateless passthrough of the peer’s own paginated `GET /sensor-nodes`.',
    }),
    ApiParam({ name: 'peerId' }),
    ApiQuery({ name: 'page', required: false, type: Number }),
    ApiQuery({ name: 'pageSize', required: false, type: Number }),
    ApiOkResponse({ schema: { type: 'object' } }),
    ApiServiceUnavailableResponse({ description: PASSTHROUGH_NOT_WIRED_DESCRIPTION }),
  );
}

export function ApiGetSensorNode() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a single sensor node’s detail from its peer' }),
    ApiParam({ name: 'peerId' }),
    ApiParam({ name: 'nodeId' }),
    ApiOkResponse({ schema: { type: 'object' } }),
    ApiServiceUnavailableResponse({ description: PASSTHROUGH_NOT_WIRED_DESCRIPTION }),
  );
}

export function ApiCreateVideoSession() {
  return applyDecorators(
    ApiOperation({
      summary: 'Open a video playback session (live or VOD) on a peer’s sensor node',
      description: 'Passthrough of `POST /video/playback/{id}/session` (protocol §5.2).',
    }),
    ApiParam({ name: 'peerId' }),
    ApiParam({ name: 'nodeId' }),
    ApiCreatedResponse({ schema: { type: 'object' } }),
    ApiServiceUnavailableResponse({ description: PASSTHROUGH_NOT_WIRED_DESCRIPTION }),
  );
}

export function ApiGetRecordings() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get a sensor node’s recordings discovery catalog',
      description: 'Passthrough of `GET /video/playback/{id}/recordings` (protocol §5.3).',
    }),
    ApiParam({ name: 'peerId' }),
    ApiParam({ name: 'nodeId' }),
    ApiOkResponse({ schema: { type: 'object' } }),
    ApiServiceUnavailableResponse({ description: PASSTHROUGH_NOT_WIRED_DESCRIPTION }),
  );
}

export function ApiGetImageAnalyticsEvent() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get a single analytics event’s detail from its peer',
      description: 'Passthrough of `GET /image-analytics/{eventId}` (protocol §6.5).',
    }),
    ApiParam({ name: 'peerId' }),
    ApiParam({ name: 'eventId' }),
    ApiOkResponse({ schema: { type: 'object' } }),
    ApiServiceUnavailableResponse({ description: PASSTHROUGH_NOT_WIRED_DESCRIPTION }),
  );
}
