import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { CustomerVentorAssignmentService } from '../customer/customer-ventor-assignment.service';
import { VentorScheduleEventSource, VentorScheduleEventType } from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import { MONGO_DUPLICATE_KEY_CODE } from './constants/lead-call-slots.constants';
import { LeadCallSlotService } from './lead-call-slot.service';
import { LeadCustomerService } from './lead-customer.service';

type BusyRow = { userId: string; scheduledAt: Date };

const buildChain = <T>(value: T) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

/** 2026-10-14 16:00 Bogota (21:00 UTC). */
const NOW = new Date('2026-10-14T21:00:00.000Z');
/** 2026-10-15 09:00 Bogota. */
const TOMORROW_9AM = new Date('2026-10-15T14:00:00.000Z');

describe('LeadCallSlotService', () => {
  let service: LeadCallSlotService;
  let busyRows: BusyRow[];
  const mockEventModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
  };
  const mockAssignment = { executeFetchAdvanceLeadVentors: jest.fn() };
  const mockLeadCustomer = { assignToVentor: jest.fn() };
  const mockConfig = { get: jest.fn().mockReturnValue(7) };

  beforeEach(() => {
    jest.clearAllMocks();
    busyRows = [];
    mockEventModel.find.mockImplementation(() => buildChain(busyRows));
    mockEventModel.findOne.mockImplementation(() => buildChain(null));
    mockEventModel.aggregate.mockImplementation(() => ({ exec: jest.fn().mockResolvedValue([]) }));
    mockEventModel.create.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: new Types.ObjectId(), ...doc }));
    mockAssignment.executeFetchAdvanceLeadVentors.mockResolvedValue([
      { id: 'u1', name: 'A', lastName: '', phone: '', phoneJob: '' },
      { id: 'u2', name: 'B', lastName: '', phone: '', phoneJob: '' },
    ]);
    service = new LeadCallSlotService(
      mockEventModel as never,
      mockAssignment as unknown as CustomerVentorAssignmentService,
      mockLeadCustomer as unknown as LeadCustomerService,
      mockConfig as unknown as ConfigService,
    );
  });

  describe('findFreeSlots', () => {
    it('offers next-day morning slots in Bogota time (today 16:00 already past the window)', async () => {
      const actualSlots = await service.findFreeSlots('morning', NOW);
      expect(actualSlots).toHaveLength(10);
      expect(actualSlots[0].start.toISOString()).toBe(TOMORROW_9AM.toISOString());
      expect(actualSlots[5].start.toISOString()).toBe('2026-10-15T16:30:00.000Z');
      expect(actualSlots[6].start.toISOString()).toBe('2026-10-16T14:00:00.000Z');
    });

    it('skips slots starting less than 30 minutes from now', async () => {
      const inputNow = new Date('2026-10-14T23:15:00.000Z');
      const actualSlots = await service.findFreeSlots('night', inputNow);
      expect(actualSlots[0].start.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    });

    it('keeps a slot when only one user is busy and drops it when every user is busy', async () => {
      busyRows = [
        { userId: 'u1', scheduledAt: TOMORROW_9AM },
        { userId: 'u1', scheduledAt: new Date('2026-10-15T14:30:00.000Z') },
        { userId: 'u2', scheduledAt: new Date('2026-10-15T14:30:00.000Z') },
      ];
      const actualSlots = await service.findFreeSlots('morning', NOW);
      const actualStarts = actualSlots.map((slot) => slot.start.toISOString());
      expect(actualStarts).toContain(TOMORROW_9AM.toISOString());
      expect(actualStarts).not.toContain('2026-10-15T14:30:00.000Z');
    });

    it('skips Sunday and starts Monday when Saturday afternoon picks morning', async () => {
      const saturdayAfternoon = new Date('2026-10-17T21:00:00.000Z');
      const actualSlots = await service.findFreeSlots('morning', saturdayAfternoon);
      expect(actualSlots[0].start.toISOString()).toBe('2026-10-19T14:00:00.000Z');
      expect(actualSlots.map((slot) => slot.start.toISOString())).not.toContain('2026-10-18T14:00:00.000Z');
    });

    it('starts Monday when the customer asks on Sunday morning', async () => {
      const sundayMorning = new Date('2026-10-18T15:00:00.000Z');
      const actualSlots = await service.findFreeSlots('morning', sundayMorning);
      expect(actualSlots[0].start.toISOString()).toBe('2026-10-19T14:00:00.000Z');
    });

    it('rolls night slots to the next day at 21:00 Bogota', async () => {
      const ninePm = new Date('2026-10-15T02:00:00.000Z');
      const actualSlots = await service.findFreeSlots('night', ninePm);
      expect(actualSlots[0].start.toISOString()).toBe('2026-10-15T23:00:00.000Z');
    });

    it('returns nothing when there are no advance-leads users', async () => {
      mockAssignment.executeFetchAdvanceLeadVentors.mockResolvedValue([]);
      expect(await service.findFreeSlots('morning', NOW)).toEqual([]);
    });
  });

  describe('bookSlot', () => {
    const inputBase = { sessionId: new Types.ObjectId(), customerId: new Types.ObjectId(), now: NOW };

    it('books a free user, tags the event as lead_conversation and assigns the customer', async () => {
      busyRows = [{ userId: 'u1', scheduledAt: TOMORROW_9AM }];
      const actual = await service.bookSlot({ ...inputBase, slotStart: TOMORROW_9AM });
      expect(actual).toMatchObject({ booked: true, userId: 'u2' });
      expect(mockEventModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: VentorScheduleEventType.Call, source: VentorScheduleEventSource.LeadConversation }),
      );
      expect(mockLeadCustomer.assignToVentor).toHaveBeenCalledWith(inputBase.customerId, 'u2');
    });

    it('falls back to the next user on a duplicate key race and fails when none is left', async () => {
      mockEventModel.create
        .mockRejectedValueOnce({ code: MONGO_DUPLICATE_KEY_CODE })
        .mockRejectedValueOnce({ code: MONGO_DUPLICATE_KEY_CODE });
      const actual = await service.bookSlot({ ...inputBase, slotStart: TOMORROW_9AM });
      expect(mockEventModel.create).toHaveBeenCalledTimes(2);
      expect(actual).toEqual({ booked: false });
    });

    it('rejects a Sunday start and a same-day morning start once the afternoon has started', async () => {
      const sundayMorning = new Date('2026-10-18T14:00:00.000Z');
      const todayMorning = new Date('2026-10-14T14:00:00.000Z');
      expect(await service.bookSlot({ ...inputBase, slotStart: sundayMorning })).toEqual({ booked: false });
      expect(await service.bookSlot({ ...inputBase, slotStart: todayMorning })).toEqual({ booked: false });
      expect(mockEventModel.create).not.toHaveBeenCalled();
    });

    it('rejects starts outside the call windows', async () => {
      const actual = await service.bookSlot({ ...inputBase, slotStart: new Date('2026-10-15T18:00:00.000Z') });
      expect(actual).toEqual({ booked: false });
      expect(mockEventModel.create).not.toHaveBeenCalled();
    });

    it('returns the existing booking of the session for the same slot', async () => {
      const existingId = new Types.ObjectId();
      mockEventModel.findOne.mockImplementation(() =>
        buildChain({ _id: existingId, userId: 'u1', scheduledAt: TOMORROW_9AM }),
      );
      const actual = await service.bookSlot({ ...inputBase, slotStart: TOMORROW_9AM });
      expect(actual).toMatchObject({ booked: true, eventId: String(existingId), userId: 'u1' });
      expect(mockEventModel.create).not.toHaveBeenCalled();
    });
  });
});
