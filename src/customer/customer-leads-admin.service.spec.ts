import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomerLeadsAdminService } from './customer-leads-admin.service';
import { CustomerService } from './customer.service';

const buildChain = <T>(value: T) => ({
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

describe('CustomerLeadsAdminService', () => {
  const customerId = new Types.ObjectId();
  const mockCustomerModel = {
    find: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
  };
  const mockSessionModel = { find: jest.fn() };
  const mockScheduleModel = { find: jest.fn() };
  const mockCustomerService = { assignCustomerAssignee: jest.fn() };
  let service: CustomerLeadsAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCustomerModel.find.mockReturnValue(buildChain([]));
    mockCustomerModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
    mockSessionModel.find.mockReturnValue(buildChain([]));
    mockScheduleModel.find.mockReturnValue(buildChain([]));
    service = new CustomerLeadsAdminService(
      mockCustomerModel as never,
      mockSessionModel as never,
      mockScheduleModel as never,
      mockCustomerService as unknown as CustomerService,
    );
  });

  it('lists leads with default filter including converted customers with sources', async () => {
    const row = {
      _id: customerId,
      name: 'Ana',
      lastName: 'Ruiz',
      phone: '573001112233',
      lifecycleStatus: 'lead',
      leadSources: ['meta_form'],
      createdAt: new Date('2026-10-15T12:00:00.000Z'),
    };
    mockCustomerModel.find.mockReturnValue(buildChain([row]));
    mockCustomerModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });
    const actual = await service.listLeads({ page: 0, limit: 50 });
    expect(actual.total).toBe(1);
    expect(actual.items[0]).toMatchObject({
      id: String(customerId),
      phone: '573001112233',
      lifecycleStatus: 'lead',
      isPromoted: false,
      leadSources: ['meta_form'],
    });
    expect(mockCustomerModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          { lifecycleStatus: 'lead' },
          { 'leadSources.0': { $exists: true } },
          {
            createdBy: {
              $in: [
                'meta-leadgen-ingest',
                'lead-conversation-bot',
                'meta-gateway-ingest',
              ],
            },
          },
        ]),
      }),
    );
  });

  it('includes next pending scheduledCall on list items', async () => {
    const eventId = new Types.ObjectId();
    const scheduledAt = new Date('2030-01-15T15:00:00.000Z');
    const row = {
      _id: customerId,
      name: 'Ana',
      lastName: 'Ruiz',
      phone: '573001112233',
      lifecycleStatus: 'lead',
      leadSources: ['whatsapp_lead_conversation'],
      createdAt: new Date('2026-10-15T12:00:00.000Z'),
    };
    mockCustomerModel.find.mockReturnValue(buildChain([row]));
    mockCustomerModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });
    mockScheduleModel.find.mockReturnValue(
      buildChain([
        {
          _id: eventId,
          customerId,
          scheduledAt,
          status: 'pending',
          userId: 'ventor-1',
          note: 'Call back',
        },
      ]),
    );
    const actual = await service.listLeads({ page: 0, limit: 50 });
    expect(actual.items[0].scheduledCall).toEqual({
      eventId: String(eventId),
      scheduledAt: scheduledAt.toISOString(),
      status: 'pending',
      ventorName: 'ventor-1',
      note: 'Call back',
    });
  });

  it('treats legacy non-prospect without lifecycleStatus as promoted customer', async () => {
    const row = {
      _id: customerId,
      name: 'Anderson',
      lastName: 'L.',
      phone: '573118857808',
      isProspect: false,
      createdBy: 'lead-conversation-bot',
      createdAt: new Date('2026-10-15T12:00:00.000Z'),
    };
    mockCustomerModel.find.mockReturnValue(buildChain([row]));
    mockCustomerModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });
    const actual = await service.listLeads({ page: 0, limit: 50 });
    expect(actual.items[0]).toMatchObject({
      phone: '573118857808',
      lifecycleStatus: 'customer',
      isPromoted: true,
    });
  });

  it('filters list by source and lifecycleStatus', async () => {
    mockCustomerModel.find.mockReturnValue(buildChain([]));
    mockCustomerModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
    await service.listLeads({
      page: 0,
      limit: 20,
      source: 'whatsapp_inbound',
      lifecycleStatus: 'customer',
    });
    expect(mockCustomerModel.find).toHaveBeenCalledWith({
      lifecycleStatus: 'customer',
      leadSources: 'whatsapp_inbound',
    });
  });

  it('converts a lead to customer and optionally assigns', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      _id: customerId,
      lifecycleStatus: 'lead',
      isProspect: true,
      createdBy: 'meta-leadgen-ingest',
      leadSources: [] as string[],
      $locals: {},
      save,
    };
    mockCustomerModel.findById
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(doc) })
      .mockReturnValueOnce(
        buildChain({
          _id: customerId,
          name: 'Ana',
          lastName: 'Ruiz',
          phone: '57300',
          lifecycleStatus: 'customer',
          leadSources: ['meta_form'],
          assignedTo: 'u1',
          createdAt: new Date(),
        }),
      );
    mockCustomerService.assignCustomerAssignee.mockResolvedValue({});
    const actual = await service.convertLead(
      String(customerId),
      { assignToUserId: 'u1' },
      'admin1',
    );
    expect(doc.lifecycleStatus).toBe('customer');
    expect(doc.isProspect).toBe(false);
    expect(doc.leadSources).toEqual(['meta_form']);
    expect(save).toHaveBeenCalled();
    expect(mockCustomerService.assignCustomerAssignee).toHaveBeenCalledWith(
      String(customerId),
      { assignedTo: 'u1' },
      'admin1',
    );
    expect(actual.isPromoted).toBe(true);
  });

  it('rejects convert when already customer', async () => {
    mockCustomerModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ lifecycleStatus: 'customer' }),
    });
    await expect(
      service.convertLead(String(customerId), {}, 'admin1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects convert for missing id', async () => {
    mockCustomerModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    await expect(
      service.convertLead(String(customerId), {}, 'admin1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
