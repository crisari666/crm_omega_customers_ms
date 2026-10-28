import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomerVentorAssignmentService } from '../customer/customer-ventor-assignment.service';
import { VentorScheduleEventStatus, VentorScheduleEventType } from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import { LeadCallScheduleAdminService } from './lead-call-schedule-admin.service';
import { LeadCallSlotService } from './lead-call-slot.service';
import { LeadConversationSessionService } from './lead-conversation-session.service';
import { LeadCustomerService } from './lead-customer.service';

const buildChain = <T>(value: T) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

describe('LeadCallScheduleAdminService', () => {
  const eventId = new Types.ObjectId();
  const sessionId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const pendingEvent = {
    _id: eventId,
    userId: 'u1',
    customerId,
    scheduledAt: new Date('2026-10-15T14:00:00.000Z'),
    status: VentorScheduleEventStatus.Pending,
    eventType: VentorScheduleEventType.Call,
    leadConversationSessionId: sessionId,
  };
  const mockEventModel = { findOne: jest.fn(), findById: jest.fn(), updateOne: jest.fn(), find: jest.fn() };
  const mockCustomerModel = { find: jest.fn() };
  const mockSessionModel = { find: jest.fn() };
  const mockAssignment = { executeFetchAdvanceLeadVentors: jest.fn() };
  const mockCallSlots = { findFreeUserIdsAt: jest.fn() };
  const mockLeadCustomer = { assignToVentor: jest.fn() };
  const mockSessionService = { setAssignedVentor: jest.fn() };
  let service: LeadCallScheduleAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventModel.findOne.mockImplementation(() => buildChain(pendingEvent));
    mockEventModel.findById.mockImplementation(() => buildChain({ ...pendingEvent, userId: 'u2' }));
    mockEventModel.updateOne.mockImplementation(() => ({ exec: jest.fn().mockResolvedValue({ matchedCount: 1 }) }));
    mockCustomerModel.find.mockImplementation(() => buildChain([{ _id: customerId, name: 'Ana', lastName: 'Ruiz', phone: '57300' }]));
    mockSessionModel.find.mockImplementation(() => buildChain([{ _id: sessionId, score: 6, priority: 3 }]));
    mockAssignment.executeFetchAdvanceLeadVentors.mockResolvedValue([
      { id: 'u2', name: 'Laura', lastName: 'Gómez', phone: '', phoneJob: '', voipPhone: '' },
    ]);
    mockCallSlots.findFreeUserIdsAt.mockResolvedValue(['u2', 'u3']);
    service = new LeadCallScheduleAdminService(
      mockEventModel as never,
      mockCustomerModel as never,
      mockSessionModel as never,
      mockAssignment as unknown as CustomerVentorAssignmentService,
      mockCallSlots as unknown as LeadCallSlotService,
      mockLeadCustomer as unknown as LeadCustomerService,
      mockSessionService as unknown as LeadConversationSessionService,
    );
  });

  it('Given no target, When reassigning, Then it picks the least-loaded free user and moves customer + session', async () => {
    const actual = await service.reassignCall({ eventId: String(eventId), actorUserId: 'admin1' });
    expect(mockCallSlots.findFreeUserIdsAt).toHaveBeenCalledWith(pendingEvent.scheduledAt, 'u1');
    expect(mockEventModel.updateOne).toHaveBeenCalledWith({ _id: eventId }, { $set: { userId: 'u2' } });
    expect(mockLeadCustomer.assignToVentor).toHaveBeenCalledWith(customerId, 'u2', 'admin1');
    expect(mockSessionService.setAssignedVentor).toHaveBeenCalledWith(sessionId, 'u2');
    expect(actual).toMatchObject({ userId: 'u2', ventorName: 'Laura Gómez', customerName: 'Ana Ruiz', score: 6 });
  });

  it('Given a target that is busy or not an advance-leads user, When reassigning, Then it rejects with conflict', async () => {
    await expect(
      service.reassignCall({ eventId: String(eventId), userId: 'u9', actorUserId: 'admin1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockEventModel.updateOne).not.toHaveBeenCalled();
  });

  it('Given no free user at that slot, When reassigning automatically, Then it rejects with conflict', async () => {
    mockCallSlots.findFreeUserIdsAt.mockResolvedValue([]);
    await expect(service.reassignCall({ eventId: String(eventId), actorUserId: 'admin1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('Given a cancelled call, When reassigning, Then it rejects with bad request', async () => {
    mockEventModel.findOne.mockImplementation(() =>
      buildChain({ ...pendingEvent, status: VentorScheduleEventStatus.Cancelled }),
    );
    await expect(service.reassignCall({ eventId: String(eventId), actorUserId: 'admin1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Given a range longer than 31 days, When listing, Then it rejects with bad request', async () => {
    await expect(service.listCalls({ from: '2026-01-01', to: '2026-03-01' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
