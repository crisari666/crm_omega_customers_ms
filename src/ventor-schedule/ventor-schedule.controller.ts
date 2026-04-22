import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateVentorScheduleEventDto } from './dto/create-ventor-schedule-event.dto';
import { UpdateVentorScheduleStatusDto } from './dto/update-ventor-schedule-status.dto';
import { VentorScheduleByDayQueryDto } from './dto/ventor-schedule-by-day-query.dto';
import { VentorScheduleService } from './ventor-schedule.service';
import { VentorScheduleEventDocument } from './schemas/ventor-schedule-event.schema';
import { CustomerDocument } from '../customer/schemas/customer.schema';

function serializeEvent(doc: VentorScheduleEventDocument) {
  const o = doc.toObject({ virtuals: true });
  const customerRaw = o.customerId as unknown;
  let customer: Record<string, unknown> | null = null;
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
  }
  return {
    id: String(o._id),
    userId: o.userId,
    customerId: String(o.customerId),
    scheduledAt: o.scheduledAt?.toISOString?.() ?? o.scheduledAt,
    eventType: o.eventType,
    note: o.note,
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

  @Get('by-day')
  async byDay(
    @Query() query: VentorScheduleByDayQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const userId = resolveOfficeUserId(jwtUser);
    const list = await this.ventorScheduleService.findByUserAndDay(
      userId,
      query.date,
    );
    return list.map((d) => serializeEvent(d));
  }

  @Patch(':id/status')
  async patchStatus(
    @Param('id') id: string,
    @Body() body: UpdateVentorScheduleStatusDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    const userId = resolveOfficeUserId(jwtUser);
    const doc = await this.ventorScheduleService.updateStatus(
      userId,
      id,
      body.status,
    );
    return serializeEvent(doc);
  }
}
