import { request } from '../http-client';
import { registerPassthroughCommands } from './passthrough.commands';
import { buildTestProgram, run } from './test-program';

jest.mock('../http-client', () => ({
  ...jest.requireActual<typeof import('../http-client')>('../http-client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);

describe('passthrough commands', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists sensor nodes for a peer with pagination', async () => {
    const program = buildTestProgram();
    registerPassthroughCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'passthrough',
      'sensor-nodes',
      '--peer',
      'peer-1',
      '--page',
      '1',
      '--page-size',
      '20',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'GET',
      '/peers/peer-1/sensor-nodes?page=1&pageSize=20',
    );
  });

  it('gets a single sensor node for a peer', async () => {
    const program = buildTestProgram();
    registerPassthroughCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'passthrough',
      'sensor-node',
      'node-1',
      '--peer',
      'peer-1',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'GET',
      '/peers/peer-1/sensor-nodes/node-1',
    );
  });

  it('creates a video session with start/end dates', async () => {
    const program = buildTestProgram();
    registerPassthroughCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'passthrough',
      'video-session',
      'node-1',
      '--peer',
      'peer-1',
      '--start-date',
      '2026-01-01T00:00:00Z',
      '--end-date',
      '2026-01-01T01:00:00Z',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'POST',
      '/peers/peer-1/video/playback/node-1/session',
      { startDate: '2026-01-01T00:00:00Z', endDate: '2026-01-01T01:00:00Z' },
    );
  });

  it('creates a live video session when neither date is given', async () => {
    const program = buildTestProgram();
    registerPassthroughCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'passthrough',
      'video-session',
      'node-1',
      '--peer',
      'peer-1',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'POST',
      '/peers/peer-1/video/playback/node-1/session',
      { startDate: undefined, endDate: undefined },
    );
  });

  it('lists VOD recordings for a sensor node', async () => {
    const program = buildTestProgram();
    registerPassthroughCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'passthrough',
      'recordings',
      'node-1',
      '--peer',
      'peer-1',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'GET',
      '/peers/peer-1/video/playback/node-1/recordings',
    );
  });

  it('fetches a single image-analytics event by id, url-encoding both ids', async () => {
    const program = buildTestProgram();
    registerPassthroughCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'passthrough',
      'image-analytics-event',
      'event/1',
      '--peer',
      'peer/1',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'GET',
      '/peers/peer%2F1/image-analytics/event%2F1',
    );
  });
});
