import { PassthroughController } from './passthrough.controller';

describe('PassthroughController', () => {
  let listSensorNodes: jest.Mock;
  let getSensorNode: jest.Mock;
  let createVideoSession: jest.Mock;
  let getRecordings: jest.Mock;
  let getImageAnalyticsEvent: jest.Mock;
  let auditRecord: jest.Mock;
  let operationLogRecord: jest.Mock;
  let peersFindAll: jest.Mock;
  let controller: PassthroughController;

  beforeEach(() => {
    listSensorNodes = jest
      .fn()
      .mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
    getSensorNode = jest.fn().mockResolvedValue({ id: 'node-1' });
    createVideoSession = jest
      .fn()
      .mockResolvedValue({ streamUrl: 'https://x/stream.m3u8', expiresIn: 300 });
    getRecordings = jest
      .fn()
      .mockResolvedValue({ firstClipDate: 'x', lastClipDate: 'y', discontinuities: [] });
    getImageAnalyticsEvent = jest.fn().mockResolvedValue({ eventId: 'evt-1' });
    auditRecord = jest.fn();
    operationLogRecord = jest.fn();
    peersFindAll = jest
      .fn()
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    controller = new PassthroughController(
      {
        listSensorNodes,
        getSensorNode,
        createVideoSession,
        getRecordings,
        getImageAnalyticsEvent,
      },
      { record: auditRecord } as never,
      { record: operationLogRecord } as never,
      { findAll: peersFindAll } as never,
    );
  });

  it('listPeers() forwards page/pageSize to PeersService.findAll() — same operation as /admin/peers, reachable without the admin prefix', async () => {
    await controller.listPeers({ page: 2, pageSize: 50 });
    expect(peersFindAll).toHaveBeenCalledWith(2, 50);
  });

  it('listSensorNodes() forwards peerId and page/pageSize', async () => {
    await controller.listSensorNodes('peer-1', { page: 2, pageSize: 50 });
    expect(listSensorNodes).toHaveBeenCalledWith('peer-1', 2, 50);
  });

  it('getSensorNode() forwards peerId and nodeId', async () => {
    await controller.getSensorNode('peer-1', 'node-1');
    expect(getSensorNode).toHaveBeenCalledWith('peer-1', 'node-1');
  });

  it('createVideoSession() forwards peerId, nodeId, and body', async () => {
    const body = { startDate: '2026-01-01T00:00:00Z', endDate: '2026-01-01T01:00:00Z' };
    await controller.createVideoSession('peer-1', 'node-1', body);
    expect(createVideoSession).toHaveBeenCalledWith('peer-1', 'node-1', body);
  });

  it('createVideoSession() records video_session_live_requested when startDate/endDate are absent', async () => {
    await controller.createVideoSession('peer-1', 'node-1', {});
    expect(operationLogRecord).toHaveBeenCalledWith('video_session_live_requested', 'peer-1', {
      nodeId: 'node-1',
    });
  });

  it('createVideoSession() records video_session_history_requested when startDate/endDate are present', async () => {
    const body = { startDate: '2026-01-01T00:00:00Z', endDate: '2026-01-01T01:00:00Z' };
    await controller.createVideoSession('peer-1', 'node-1', body);
    expect(operationLogRecord).toHaveBeenCalledWith('video_session_history_requested', 'peer-1', {
      nodeId: 'node-1',
    });
  });

  it('getRecordings() forwards peerId and nodeId', async () => {
    await controller.getRecordings('peer-1', 'node-1');
    expect(getRecordings).toHaveBeenCalledWith('peer-1', 'node-1');
  });

  it('getImageAnalyticsEvent() forwards peerId and eventId', async () => {
    await controller.getImageAnalyticsEvent('peer-1', 'event-1');
    expect(getImageAnalyticsEvent).toHaveBeenCalledWith('peer-1', 'event-1');
  });

  it('getImageAnalyticsEvent() records an access audit event and still returns the result', async () => {
    const result = await controller.getImageAnalyticsEvent('peer-1', 'event-1');

    expect(result).toEqual({ eventId: 'evt-1' });
    expect(auditRecord).toHaveBeenCalledWith({
      category: 'access',
      action: 'image_analytics_read',
      peerId: 'peer-1',
      detail: 'eventId=event-1',
    });
  });
});
