import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateWebinarEventDto } from './dto/create-webinar-event.dto';
import { UpdateWebinarEventDto } from './dto/update-webinar-event.dto';
import { WebinarEventsService } from './webinar-events.service';

@Controller('webinar-events')
export class WebinarEventsController {
  constructor(private readonly webinarEventsService: WebinarEventsService) {}

  @Get('test')
  testWebinarEvents(): { status: string } {
    return { status: 'webinar-events controller alive' };
  }

  @Post()
  createEvent(
    @Body() body: CreateWebinarEventDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    resolveOfficeUserId(jwtUser);
    return this.webinarEventsService.executeCreate(body);
  }

  @Patch(':id')
  updateEvent(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() body: UpdateWebinarEventDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    resolveOfficeUserId(jwtUser);
    return this.webinarEventsService.executeUpdate(id, body);
  }

  @Delete(':id')
  deleteEvent(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    resolveOfficeUserId(jwtUser);
    return this.webinarEventsService.executeDelete(id);
  }

  @Get()
  listEvents(@JwtUser() jwtUser: OfficeJwtPayload | undefined) {
    assertOfficeAdmin(jwtUser);
    return this.webinarEventsService.executeList();
  }

  @Get(':id')
  getEvent(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.webinarEventsService.executeGetById(id);
  }
}
