import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import {
  assertOfficeOnLandCoordinator,
  isOfficeOnLandCoordinator,
} from '../core/utils/assert-office-main-lead.util';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateVentorScheduleEventDto } from './dto/create-ventor-schedule-event.dto';
import { SyncVentorMeetCallDto } from '../customer/dto/sync-ventor-meet-call.dto';
import { UpdateOnLandAgentDto } from './dto/update-on-land-agent.dto';
import { UpdateVentorScheduleStatusDto } from './dto/update-ventor-schedule-status.dto';
import { VentorScheduleByDayQueryDto } from './dto/ventor-schedule-by-day-query.dto';
import { VENTOR_SCHEDULE_BY_DAY_VIEW } from './dto/ventor-schedule-by-day-view.const';
import { VentorScheduleService } from './ventor-schedule.service';
import { VentorScheduleEventDocument } from './schemas/ventor-schedule-event.schema';
import { CustomerDocument } from '../customer/schemas/customer.schema';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';

function serializeEvent(doc: VentorScheduleEventDocument) {
  const o = doc.toObject({ virtuals: true });
  const customerRaw = o.customerId as unknown;
  let customer: Record<string, unknown> | null = null;
  let customerId = String(o.customerId);
  if (
    customerRaw &&
    typeof customerRaw === 'object' &&
    '_id' in customerRaw
  ) {
    const c = customerRaw as CustomerDocument;
    const name = [c.name, c.lastName].filter(Boolean).join(' ').trim();
    const lastInterest = c.interestedProjects?.at(-1);
    customer = {
      id: String(c._id),
      displayName: name || c.name,
      lastProjectId: lastInterest?.projectId,
    };
    customerId = String(c._id);
  }
  return {
    id: String(o._id),
    userId: o.userId,
    onLandAgentUserId: o.onLandAgentUserId ?? null,
    customerId,
    scheduledAt: o.scheduledAt?.toISOString?.() ?? o.scheduledAt,
    eventType: o.eventType,
    note: o.note,
    googleMeetUrl: o.googleMeetUrl,
    googleCalendarEventId: o.googleCalendarEventId,
    status: o.status,
    createdAt:
      (o as { createdAt?: Date }).createdAt?.toISOString?.() ??
      (o as { createdAt?: Date }).createdAt,
    updatedAt:
      (o as { updatedAt?: Date }).updatedAt?.toISOString?.() ??
      (o as { updatedAt?: Date }).updatedAt,
    customer,
  };
}

@Controller('ventor-schedule')
export class VentorScheduleController {
  constructor(private readonly ventorScheduleService: VentorScheduleService) {}

  @Post()
  async create(
    @Body() body: CreateVentorScheduleEventDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const userId = resolveOfficeUserId(jwtUser);
    const doc = await this.ventorScheduleService.create(userId, body);
    await doc.populate({
      path: 'customerId',
      select: 'name lastName interestedProjects',
    });
    return serializeEvent(doc);
  }

  @Get('by-customer/:customerId')
  async byCustomer(
    @Param('customerId', ParseHexObjectIdPipe) customerId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const userId = resolveOfficeUserId(jwtUser);
    const list = await this.ventorScheduleService.findByCustomerForUser(
      userId,
      customerId,
    );
    return list.map((d) => serializeEvent(d));
  }

  @Get('by-day')
  async byDay(
    @Query() query: VentorScheduleByDayQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const view = query.view ?? VENTOR_SCHEDULE_BY_DAY_VIEW.Self;
    if (view === VENTOR_SCHEDULE_BY_DAY_VIEW.MainLeadOnLand) {
      assertOfficeOnLandCoordinator(jwtUser);
      const list = await this.ventorScheduleService.findAllOnLandByDay(
        query.date,
      );
      return list.map((d) => serializeEvent(d));
    }
    const userId = resolveOfficeUserId(jwtUser);
    const list = await this.ventorScheduleService.findByUserAndDay(
      userId,
      query.date,
    );
    return list.map((d) => serializeEvent(d));
  }

  @Post(':id/meet-sync')
  async meetSync(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() body: SyncVentorMeetCallDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const userId = resolveOfficeUserId(jwtUser);
    return this.ventorScheduleService.syncMeetCall(userId, id, body);
  }

  @Patch(':id/on-land-agent')
  async patchOnLandAgent(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() body: UpdateOnLandAgentDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const userId = resolveOfficeUserId(jwtUser);
    const doc = await this.ventorScheduleService.assignOnLandAgent({
      actorUserId: userId,
      isCoordinator: isOfficeOnLandCoordinator(jwtUser),
      eventId: id,
      onLandAgentUserId: body.onLandAgentUserId,
    });
    return serializeEvent(doc);
  }

  @Patch(':id/status')
  async patchStatus(
    @Param('id') id: string,
    @Body() body: UpdateVentorScheduleStatusDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const userId = resolveOfficeUserId(jwtUser);
    try {
      const doc = await this.ventorScheduleService.updateStatus(
        userId,
        id,
        body.status,
      );
      return serializeEvent(doc);
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        if (!isOfficeOnLandCoordinator(jwtUser)) {
          throw err;
        }
        const doc = await this.ventorScheduleService.updateStatusAsCoordinator(
          userId,
          id,
          body.status,
        );
        return serializeEvent(doc);
      }
      throw err;
    }
  }
}
