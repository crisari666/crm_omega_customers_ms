import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Param,
} from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateMetaLeadFormDto } from './dto/create-meta-lead-form.dto';
import { UpdateMetaLeadFormDto } from './dto/update-meta-lead-form.dto';
import { UpdateMetaLeadFormSettingsDto } from './dto/update-meta-lead-form-settings.dto';
import { MetaLeadFormsService } from './meta-lead-forms.service';
import type {
  MetaLeadFormListItem,
  MetaLeadFormSettingsView,
} from './types/meta-lead-form-list-item.type';

/**
 * Admin registry for Meta Lead Ads forms → CRM flow strategy.
 */
@Controller('admin/customer/meta-lead-forms')
export class MetaLeadFormsController {
  constructor(private readonly metaLeadFormsService: MetaLeadFormsService) {}

  @Get('test')
  testMetaLeadForms(): { status: string } {
    return { status: 'meta-lead-forms controller alive' };
  }

  @Get('settings')
  getSettings(
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadFormSettingsView> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadFormsService.executeGetSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body() body: UpdateMetaLeadFormSettingsDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadFormSettingsView> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadFormsService.executeUpdateSettings(body);
  }

  @Get()
  listForms(
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadFormListItem[]> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadFormsService.executeList();
  }

  @Get(':id')
  getForm(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadFormListItem> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadFormsService.executeGetById(id);
  }

  @Post()
  createForm(
    @Body() body: CreateMetaLeadFormDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadFormListItem> {
    assertOfficeAdmin(jwtUser);
    const officeUserId = resolveOfficeUserId(jwtUser);
    return this.metaLeadFormsService.executeCreate(body, officeUserId);
  }

  @Patch(':id')
  updateForm(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() body: UpdateMetaLeadFormDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadFormListItem> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadFormsService.executeUpdate(id, body);
  }

  @Delete(':id')
  deleteForm(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<{ readonly deleted: true }> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadFormsService.executeDelete(id);
  }
}
