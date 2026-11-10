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
import { CreateMetaLeadAdCampaignDto } from './dto/create-meta-lead-ad-campaign.dto';
import { CreateMetaLeadFormDto } from './dto/create-meta-lead-form.dto';
import { UpdateMetaLeadAdCampaignDto } from './dto/update-meta-lead-ad-campaign.dto';
import { UpdateMetaLeadFormDto } from './dto/update-meta-lead-form.dto';
import { UpdateMetaLeadFormSettingsDto } from './dto/update-meta-lead-form-settings.dto';
import { MetaLeadAdCampaignsService } from './meta-lead-ad-campaigns.service';
import { MetaLeadFormsService } from './meta-lead-forms.service';
import type { MetaLeadAdCampaignListItem } from './types/meta-lead-ad-campaign-list-item.type';
import type {
  MetaLeadFormListItem,
  MetaLeadFormSettingsView,
} from './types/meta-lead-form-list-item.type';
import type { MetaLeadFormStatsResponse } from './types/meta-lead-form-stats.type';

/**
 * Admin registry for Meta Lead Ads forms → CRM flow strategy (+ ad→project).
 * Static paths (`settings`, `stats`, `ad-campaigns`) must stay above `:id`
 * so Nest does not treat them as form ObjectIds.
 * Registered on CustomerModule before CustomerAdminController so
 * `GET admin/customer/meta-lead-forms` is not captured by `:customerId`.
 */
@Controller('admin/customer/meta-lead-forms')
export class MetaLeadFormsController {
  constructor(
    private readonly metaLeadFormsService: MetaLeadFormsService,
    private readonly metaLeadAdCampaignsService: MetaLeadAdCampaignsService,
  ) {}

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

  @Get('stats')
  getStats(
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadFormStatsResponse> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadFormsService.executeGetStats();
  }

  @Patch('settings')
  updateSettings(
    @Body() body: UpdateMetaLeadFormSettingsDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadFormSettingsView> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadFormsService.executeUpdateSettings(body);
  }

  @Get('ad-campaigns/test')
  testMetaLeadAdCampaigns(): { status: string } {
    return { status: 'meta-lead-ad-campaigns routes alive' };
  }

  @Get('ad-campaigns')
  listAdCampaigns(
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadAdCampaignListItem[]> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadAdCampaignsService.executeList();
  }

  @Post('ad-campaigns')
  createAdCampaign(
    @Body() body: CreateMetaLeadAdCampaignDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadAdCampaignListItem> {
    assertOfficeAdmin(jwtUser);
    const officeUserId = resolveOfficeUserId(jwtUser);
    return this.metaLeadAdCampaignsService.executeCreate(body, officeUserId);
  }

  @Get('ad-campaigns/:adCampaignId')
  getAdCampaign(
    @Param('adCampaignId', ParseHexObjectIdPipe) adCampaignId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadAdCampaignListItem> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadAdCampaignsService.executeGetById(adCampaignId);
  }

  @Patch('ad-campaigns/:adCampaignId')
  updateAdCampaign(
    @Param('adCampaignId', ParseHexObjectIdPipe) adCampaignId: string,
    @Body() body: UpdateMetaLeadAdCampaignDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadAdCampaignListItem> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadAdCampaignsService.executeUpdate(adCampaignId, body);
  }

  @Delete('ad-campaigns/:adCampaignId')
  deleteAdCampaign(
    @Param('adCampaignId', ParseHexObjectIdPipe) adCampaignId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<{ readonly deleted: true }> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadAdCampaignsService.executeDelete(adCampaignId);
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
