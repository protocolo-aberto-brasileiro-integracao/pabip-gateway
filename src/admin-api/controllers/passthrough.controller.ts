import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { Trace } from '../../common/trace.decorator';
import type { TraceContext } from '../../common/request-id.util';
import { PeersAccessGuard } from '../../auth/guards/peers-access.guard';
import { OperationLogService } from '../../operation-log/operation-log.service';
import { PeersService, type PeerListResult } from '../../peers/peers.service';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { VideoSessionRequestDto } from '../dto/video-session-request.dto';
import {
  OUTBOUND_CLIENT,
  type OutboundClientPort,
  type RecordingsCatalog,
  type SensorNodeListing,
  type VideoSession,
} from '../outbound-client.port';
import { ApiListPeers } from './peers.docs';
import {
  ApiCreateVideoSession,
  ApiGetImageAnalyticsEvent,
  ApiGetRecordings,
  ApiGetSensorNode,
  ApiListSensorNodes,
  ApiPassthroughController,
} from './passthrough.docs';

@ApiPassthroughController()
@Controller('peers')
@UseGuards(PeersAccessGuard)
export class PassthroughController {
  constructor(
    @Inject(OUTBOUND_CLIENT) private readonly outboundClient: OutboundClientPort,
    private readonly auditService: AuditService,
    private readonly operationLogService: OperationLogService,
    private readonly peersService: PeersService,
  ) {}

  @Get()
  @ApiListPeers()
  listPeers(@Query() query: PaginationQueryDto): Promise<PeerListResult> {
    return this.peersService.findAll(query.page, query.pageSize);
  }

  @Get(':peerId/sensor-nodes')
  @ApiListSensorNodes()
  listSensorNodes(
    @Param('peerId') peerId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<SensorNodeListing> {
    return this.outboundClient.listSensorNodes(peerId, query.page, query.pageSize);
  }

  @Get(':peerId/sensor-nodes/:nodeId')
  @ApiGetSensorNode()
  getSensorNode(
    @Param('peerId') peerId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<unknown> {
    return this.outboundClient.getSensorNode(peerId, nodeId);
  }

  @Post(':peerId/video/playback/:nodeId/session')
  @ApiCreateVideoSession()
  async createVideoSession(
    @Param('peerId') peerId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: VideoSessionRequestDto,
    @Trace() trace: TraceContext,
  ): Promise<VideoSession> {
    const result = await this.outboundClient.createVideoSession(peerId, nodeId, body);
    const operationType =
      body.startDate && body.endDate
        ? 'video_session_history_requested'
        : 'video_session_live_requested';
    this.operationLogService.record(operationType, peerId, { nodeId }, trace);
    return result;
  }

  @Get(':peerId/video/playback/:nodeId/recordings')
  @ApiGetRecordings()
  getRecordings(
    @Param('peerId') peerId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<RecordingsCatalog> {
    return this.outboundClient.getRecordings(peerId, nodeId);
  }

  @Get(':peerId/image-analytics/:eventId')
  @ApiGetImageAnalyticsEvent()
  async getImageAnalyticsEvent(
    @Param('peerId') peerId: string,
    @Param('eventId') eventId: string,
    @Trace() trace: TraceContext,
  ): Promise<unknown> {
    const result = await this.outboundClient.getImageAnalyticsEvent(peerId, eventId);
    this.auditService.record({
      category: 'access',
      action: 'image_analytics_read',
      peerId,
      detail: `eventId=${eventId}`,
      requestId: trace.requestId,
      actorId: trace.actorId,
      caseRef: trace.caseRef,
    });
    return result;
  }
}
