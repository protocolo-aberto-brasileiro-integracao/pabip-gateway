import { OperationLogAdminController } from './operation-log.controller';

function buildOperationLogServiceMock() {
  return { summarize: jest.fn().mockResolvedValue([]) };
}

describe('OperationLogAdminController', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes explicit from/to through as Date objects', async () => {
    const operationLogService = buildOperationLogServiceMock();
    const controller = new OperationLogAdminController(operationLogService as never);

    await controller.summary({ from: '2026-07-01T00:00:00Z', to: '2026-08-01T00:00:00Z' });

    expect(operationLogService.summarize).toHaveBeenCalledWith(
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-08-01T00:00:00Z'),
    );
  });

  it('defaults to the last 30 days when neither from nor to is given', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T12:00:00Z'));
    const operationLogService = buildOperationLogServiceMock();
    const controller = new OperationLogAdminController(operationLogService as never);

    await controller.summary({});

    expect(operationLogService.summarize).toHaveBeenCalledWith(
      new Date('2026-07-07T12:00:00Z'),
      new Date('2026-08-06T12:00:00Z'),
    );
  });

  it('returns whatever OperationLogService.summarize() resolves', async () => {
    const operationLogService = buildOperationLogServiceMock();
    operationLogService.summarize.mockResolvedValue([
      { date: '2026-08-06', operationType: 'analytics_batch_received', count: 3 },
    ]);
    const controller = new OperationLogAdminController(operationLogService as never);

    const result = await controller.summary({});

    expect(result).toEqual([
      { date: '2026-08-06', operationType: 'analytics_batch_received', count: 3 },
    ]);
  });
});
