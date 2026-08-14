import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { Customer } from '../customer/schemas/customer.schema';
import { CustomerAssignmentPushService } from '../customer/customer-assignment-push.service';
import { CustomerCallLogsService } from '../customer/customer-call-logs.service';
import { CustomerEventsService } from '../customer/customer-events.service';
import {
  VentorScheduleEvent,
  VentorScheduleEventStatus,
  VentorScheduleEventType,
} from './schemas/ventor-schedule-event.schema';
import { VentorScheduleService } from './ventor-schedule.service';

describe('VentorScheduleService', () => {
  const eventId = '507f1f77bcf86cd799439011';
  const otherUserId = '507f1f77bcf86cd799439012';
  const customerId = '507f1f77bcf86cd799439013';
  const mainLeadActorId = '507f1f77bcf86cd799439014';

  const createChain = (resolveValue: unknown) => ({
    sort: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(resolveValue),
  });

  const setup = () => {
    const findMock = jest.fn();
    const findOneMock = jest.fn();
    const findOneAndUpdateMock = jest.fn();
    const scheduleModel = jest.fn().mockImplementation(() => ({
      save: jest.fn().mockResolvedValue({}),
    })) as unknown as typeof Model;
    (scheduleModel as unknown as { find: typeof findMock }).find = findMock;
    (scheduleModel as unknown as { findOne: typeof findOneMock }).findOne =
      findOneMock;
    (
      scheduleModel as unknown as { findOneAndUpdate: typeof findOneAndUpdateMock }
    ).findOneAndUpdate = findOneAndUpdateMock;
    const customerFindById = jest.fn();
    const customerModel = {
      findById: customerFindById,
    };
    const recordEventMock = jest.fn().mockResolvedValue(undefined);
    const customerEventsService = {
      createEvent: recordEventMock,
    };
    const customerCallLogsService = {
      createGoogleMeetScheduleLog: jest.fn(),
      applyGoogleMeetSync: jest.fn(),
    };
    const customerAssignmentPushService = {
      executeNotifyOnLandAgentAssigned: jest.fn(),
    };
    return {
      scheduleModel,
      findMock,
      findOneMock,
      findOneAndUpdateMock,
      customerModel,
      customerFindById,
      customerEventsService,
      recordEventMock,
      customerCallLogsService,
      customerAssignmentPushService,
    };
  };

  const compileService = async (
    deps: ReturnType<typeof setup>,
  ): Promise<VentorScheduleService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        VentorScheduleService,
        {
          provide: getModelToken(VentorScheduleEvent.name),
          useValue: deps.scheduleModel,
        },
        { provide: getModelToken(Customer.name), useValue: deps.customerModel },
        {
          provide: CustomerEventsService,
          useValue: deps.customerEventsService,
        },
        {
          provide: CustomerCallLogsService,
          useValue: deps.customerCallLogsService,
        },
        {
          provide: CustomerAssignmentPushService,
          useValue: deps.customerAssignmentPushService,
        },
      ],
    }).compile();
    return moduleRef.get(VentorScheduleService);
  };

  it('findCoordinatorAgendaByDay queries on-land or owner events in date range', async () => {
    const deps = setup();
    const service = await compileService(deps);
    deps.findMock.mockReturnValue(createChain([]));
    const list = await service.findCoordinatorAgendaByDay(
      mainLeadActorId,
      '2026-04-30',
    );
    expect(list).toEqual([]);
    expect(deps.findMock).toHaveBeenCalledWith({
      scheduledAt: expect.objectContaining({
        $gte: expect.any(Date),
        $lt: expect.any(Date),
      }),
      $or: [
        { eventType: VentorScheduleEventType.OnLand },
        { userId: mainLeadActorId },
      ],
    });
  });

  it('updateStatusAsMainLead rejects non-on_land event', async () => {
    const deps = setup();
    const service = await compileService(deps);
    deps.findOneMock.mockReturnValue(
      createChain({
        _id: new Types.ObjectId(eventId),
        status: VentorScheduleEventStatus.Pending,
        eventType: VentorScheduleEventType.Virtual,
        customerId: new Types.ObjectId(customerId),
        scheduledAt: new Date('2026-04-30T15:00:00.000Z'),
      }),
    );
    await expect(
      service.updateStatusAsMainLead(
        mainLeadActorId,
        eventId,
        VentorScheduleEventStatus.Done,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it('updateStatusAsMainLead updates on_land and records actor as main lead', async () => {
    const deps = setup();
    const service = await compileService(deps);
    const oid = new Types.ObjectId(eventId);
    const cid = new Types.ObjectId(customerId);
    deps.findOneMock.mockReturnValueOnce(
      createChain({
        _id: oid,
        status: VentorScheduleEventStatus.Pending,
        eventType: VentorScheduleEventType.OnLand,
        customerId: cid,
        scheduledAt: new Date('2026-04-30T15:00:00.000Z'),
      }),
    );
    const populatedDoc = {
      _id: oid,
      status: VentorScheduleEventStatus.Done,
      eventType: VentorScheduleEventType.OnLand,
      customerId: { _id: cid, name: 'A', lastName: 'B', interestedProjects: [] },
      scheduledAt: new Date('2026-04-30T15:00:00.000Z'),
      toObject: () => ({}),
    };
    deps.findOneAndUpdateMock.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(populatedDoc),
      }),
    });
    const out = await service.updateStatusAsMainLead(
      mainLeadActorId,
      eventId,
      VentorScheduleEventStatus.Done,
    );
    expect(out).toBe(populatedDoc);
    expect(deps.recordEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: mainLeadActorId,
        customerId: String(cid),
      }),
    );
  });

  it('updateStatusAsMainLead throws NotFound for invalid id', async () => {
    const deps = setup();
    const service = await compileService(deps);
    await expect(
      service.updateStatusAsMainLead(
        mainLeadActorId,
        'not-an-object-id',
        VentorScheduleEventStatus.Done,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateStatus throws NotFound when event belongs to another user', async () => {
    const deps = setup();
    const service = await compileService(deps);
    deps.findOneMock.mockReturnValue(createChain(null));
    await expect(
      service.updateStatus(
        otherUserId,
        eventId,
        VentorScheduleEventStatus.Done,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
