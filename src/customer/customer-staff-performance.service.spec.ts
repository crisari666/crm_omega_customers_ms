import { CustomerStaffPerformanceService } from './customer-staff-performance.service';

describe('CustomerStaffPerformanceService', () => {
  const validId = '507f1f77bcf86cd799439011';

  const createService = () => {
    const aggregateMock = jest.fn();
    const connection = {
      db: {
        aggregate: aggregateMock,
      },
    };
    const customerModel = {
      collection: { name: 'customers' },
    };
    const callLogModel = {
      collection: { name: 'customer_call_logs' },
    };
    const stepModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };
    const assignmentLogModel = {
      collection: { name: 'customerassignmentchangelogs' },
    };
    const service = new CustomerStaffPerformanceService(
      connection as never,
      customerModel as never,
      callLogModel as never,
      assignmentLogModel as never,
      stepModel as never,
    );
    return { service, aggregateMock };
  };

  it('returns empty rows when userIds is empty after dedupe without aggregate', async () => {
    const { service, aggregateMock } = createService();
    const out = await service.getReport({
      userIds: [],
      assignedFrom: '2024-01-01T00:00:00.000Z',
      assignedTo: '2024-01-31T23:59:59.999Z',
    });
    expect(out.rows).toEqual([]);
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it('invokes aggregate when userIds is non-empty', async () => {
    const { service, aggregateMock } = createService();
    aggregateMock.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        {
          userId: validId,
          displayName: 'Test User',
          totalAssignedInRange: 0,
          steps: {},
          calls: { totalCalls: 0, answered: 0, dontAnswered: 0, failed: 0 },
          attendedCount: 0,
          unattendedCount: 0,
          avgTimeToAttendMs: null,
        },
      ]),
    });
    const out = await service.getReport({
      userIds: [validId],
      userDisplayNames: { [validId]: 'Test User' },
      assignedFrom: '2024-01-01T00:00:00.000Z',
      assignedTo: '2024-01-31T23:59:59.999Z',
    });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].displayName).toBe('Test User');
    expect(out.rows[0].attendedCount).toBe(0);
    expect(out.rows[0].avgTimeToAttendMs).toBeNull();
    expect(aggregateMock).toHaveBeenCalled();
  });
});
