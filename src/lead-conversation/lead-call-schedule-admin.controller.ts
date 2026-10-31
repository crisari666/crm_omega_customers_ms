import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { ListLeadCallsQueryDto } from './dto/list-lead-calls-query.dto';
import { ReassignLeadCallDto } from './dto/reassign-lead-call.dto';
import { RescheduleLeadCallDto } from './dto/reschedule-lead-call.dto';
import { UpdateLeadCallStatusDto } from './dto/update-lead-call-status.dto';
import { LeadCallScheduleAdminService } from './lead-call-schedule-admin.service';
import type { LeadCallAdminItem } from './types/lead-call-admin-item.type';
import type { LeadCallVentor } from './types/lead-call-ventor.type';

/**
 * CRM admin agenda of lead calls (`call` schedule events). JWT via TokenJwtMiddleware on `/admin/customer`.
 * The `/agenda` segment keeps `GET admin/customer/:customerId` from capturing the list route.
 */
@Controller('admin/customer/lead-calls/agenda')
export class LeadCallScheduleAdminController {
  constructor(private readonly adminService: LeadCallScheduleAdminService) {}

  @Get()
  listCalls(@Query() query: ListLeadCallsQueryDto): Promise<LeadCallAdminItem[]> {
    return this.adminService.listCalls(query);
  }

  /** Users flagged "Asignar Leads Calificados" (reassign picker). */
  @Get('ventors')
  listVentors(): Promise<LeadCallVentor[]> {
    return this.adminService.listVentors();
  }

  @Patch(':eventId/reassign')
  reassignCall(
    @Param('eventId', ParseHexObjectIdPipe) eventId: string,
    @Body() body: ReassignLeadCallDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadCallAdminItem> {
    return this.adminService.reassignCall({ eventId, userId: body.userId, actorUserId: resolveOfficeUserId(jwtUser) });
  }

  /** Change Bogota date/time (and optionally ventor) for a pending lead call. */
  @Patch(':eventId/reschedule')
  rescheduleCall(
    @Param('eventId', ParseHexObjectIdPipe) eventId: string,
    @Body() body: RescheduleLeadCallDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<LeadCallAdminItem> {
    return this.adminService.rescheduleCall({
      eventId,
      date: body.date,
      time: body.time,
      userId: body.userId,
      actorUserId: resolveOfficeUserId(jwtUser),
    });
  }

  @Patch(':eventId/status')
  updateStatus(
    @Param('eventId', ParseHexObjectIdPipe) eventId: string,
    @Body() body: UpdateLeadCallStatusDto,
  ): Promise<LeadCallAdminItem> {
    return this.adminService.updateStatus(eventId, body.status);
  }
}
