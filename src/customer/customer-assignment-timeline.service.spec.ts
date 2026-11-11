import { Types } from 'mongoose';
import { CustomerAssignmentTimelineService } from './customer-assignment-timeline.service';
import type { AssignmentTimelineAggRow } from './types/assignment-timeline.type';

describe('CustomerAssignmentTimelineService', () => {
  let service: CustomerAssignmentTimelineService;
  let aggregateExec: jest.Mock;

  beforeEach(() => {
    aggregateExec = jest.fn().mockResolvedValue([]);
    const mockModel = {
      aggregate: jest.fn().mockReturnValue({ exec: aggregateExec }),
    };
    service = new CustomerAssignmentTimelineService(mockModel as never);
  });

  function buildAggRow(overrides: Partial<AssignmentTimelineAggRow> = {}): AssignmentTimelineAggRow {
    const customerId = new Types.ObjectId();
    return {
      _id: new Types.ObjectId(),
      customerId,
      assignedTo: 'ventor-1',
      createdAt: new Date('2026-11-10T18:00:00.000Z'),
      customerName: 'Ana',
      customerLastName: 'Pérez',
      customerPhone: '573001112233',
      customerCreatedAt: new Date('2026-11-10T17:00:00.000Z'),
      campaignFlowStrategy: 'immediate_assign',
      campaignCreatedAt: new Date('2026-11-10T17:05:00.000Z'),
      campaignGatewayReceivedAt: '2026-11-10T17:04:00.000Z',
      ...overrides,
    };
  }

  it('maps rows with assignedAt, arrivedAt from gateway, and flowStrategy', async () => {
    aggregateExec.mockResolvedValue([buildAggRow()]);
    const actual = await service.listTimeline({
      dateFrom: '2026-11-01T00:00:00.000Z',
      dateTo: '2026-11-11T00:00:00.000Z',
    });
    expect(actual.events).toHaveLength(1);
    expect(actual.events[0]).toMatchObject({
      ventorId: 'ventor-1',
      assignedAt: '2026-11-10T18:00:00.000Z',
      arrivedAt: '2026-11-10T17:04:00.000Z',
      flowStrategy: 'immediate_assign',
      customerName: 'Ana',
      customerPhone: '573001112233',
    });
    expect(actual.hasMoreOlder).toBe(false);
    expect(actual.nextCursorBefore).toBe('2026-11-10T18:00:00.000Z');
  });

  it('filters by flowStrategy after mapping', async () => {
    aggregateExec.mockResolvedValue([
      buildAggRow({ campaignFlowStrategy: 'immediate_assign' }),
      buildAggRow({
        assignedTo: 'ventor-2',
        campaignFlowStrategy: 'lead_conversation',
        createdAt: new Date('2026-11-10T19:00:00.000Z'),
      }),
    ]);
    const actual = await service.listTimeline({
      dateFrom: '2026-11-01T00:00:00.000Z',
      dateTo: '2026-11-11T00:00:00.000Z',
      flowStrategy: 'lead_conversation',
    });
    expect(actual.events).toHaveLength(1);
    expect(actual.events[0].ventorId).toBe('ventor-2');
    expect(actual.events[0].flowStrategy).toBe('lead_conversation');
  });

  it('sets hasMoreOlder and nextCursorBefore when more than limit', async () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      buildAggRow({
        createdAt: new Date(`2026-11-10T${18 - index}:00:00.000Z`),
        assignedTo: `v${index}`,
      }),
    );
    aggregateExec.mockResolvedValue(rows);
    const actual = await service.listTimeline({
      dateFrom: '2026-11-01T00:00:00.000Z',
      dateTo: '2026-11-11T00:00:00.000Z',
      limit: 2,
    });
    expect(actual.events).toHaveLength(2);
    expect(actual.hasMoreOlder).toBe(true);
    expect(actual.nextCursorBefore).toBe(actual.events[1].assignedAt);
  });

  it('falls back arrivedAt to session then customer then assignedAt', async () => {
    aggregateExec.mockResolvedValue([
      buildAggRow({
        campaignGatewayReceivedAt: '',
        campaignCreatedAt: undefined,
        sessionCreatedAt: new Date('2026-11-10T16:30:00.000Z'),
      }),
    ]);
    const withSession = await service.listTimeline({
      dateFrom: '2026-11-01T00:00:00.000Z',
      dateTo: '2026-11-11T00:00:00.000Z',
    });
    expect(withSession.events[0].arrivedAt).toBe('2026-11-10T16:30:00.000Z');
    aggregateExec.mockResolvedValue([
      buildAggRow({
        campaignGatewayReceivedAt: undefined,
        campaignCreatedAt: undefined,
        sessionCreatedAt: undefined,
        customerCreatedAt: new Date('2026-11-10T15:00:00.000Z'),
      }),
    ]);
    const withCustomer = await service.listTimeline({
      dateFrom: '2026-11-01T00:00:00.000Z',
      dateTo: '2026-11-11T00:00:00.000Z',
    });
    expect(withCustomer.events[0].arrivedAt).toBe('2026-11-10T15:00:00.000Z');
  });

  it('applies ventorId and cursorBefore in the aggregate match', async () => {
    const mockAggregate = jest.fn().mockReturnValue({ exec: aggregateExec });
    service = new CustomerAssignmentTimelineService({ aggregate: mockAggregate } as never);
    await service.listTimeline({
      dateFrom: '2026-11-01T00:00:00.000Z',
      dateTo: '2026-11-11T00:00:00.000Z',
      ventorId: 'ventor-9',
      cursorBefore: '2026-11-10T20:00:00.000Z',
    });
    const pipeline = mockAggregate.mock.calls[0][0] as Array<{ $match?: Record<string, unknown> }>;
    expect(pipeline[0].$match).toEqual({
      assignedTo: 'ventor-9',
      createdAt: {
        $gte: new Date('2026-11-01T00:00:00.000Z'),
        $lt: new Date('2026-11-10T20:00:00.000Z'),
      },
    });
  });
});
