import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateWebinarLeadDto } from './dto/create-webinar-lead.dto';
import { ImportWebinarLeadsDto } from './dto/import-webinar-leads.dto';
import { ListWebinarLeadsQueryDto } from './dto/list-webinar-leads.query.dto';
import { WebinarLeadsService } from './webinar-leads.service';

@Controller('webinar-leads')
export class WebinarLeadsController {
  constructor(private readonly webinarLeadsService: WebinarLeadsService) {}

  @Get('test')
  testWebinarLeads(): { status: string } {
    return { status: 'webinar-leads controller alive' };
  }

  @Get()
  listLeads(
    @Query() query: ListWebinarLeadsQueryDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.webinarLeadsService.executeList(query);
  }

  @Post()
  createLead(
    @Body() body: CreateWebinarLeadDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    resolveOfficeUserId(jwtUser);
    return this.webinarLeadsService.executeCreate(body);
  }

  @Post('import')
  importLeads(
    @Body() body: ImportWebinarLeadsDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    resolveOfficeUserId(jwtUser);
    return this.webinarLeadsService.executeImport(body);
  }

  @Get(':id')
  getLead(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.webinarLeadsService.executeGetById(id);
  }

  @Delete(':id')
  deleteLead(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    resolveOfficeUserId(jwtUser);
    return this.webinarLeadsService.executeDelete(id);
  }

  @Post(':id/convert')
  convertLead(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    const actorUserId = resolveOfficeUserId(jwtUser);
    return this.webinarLeadsService.executeConvert(id, actorUserId);
  }
}
