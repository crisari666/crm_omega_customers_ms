import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { CreateMetaLeadAdCampaignDto } from './dto/create-meta-lead-ad-campaign.dto';
import { UpdateMetaLeadAdCampaignDto } from './dto/update-meta-lead-ad-campaign.dto';
import { MetaLeadAdCampaignsService } from './meta-lead-ad-campaigns.service';
import type { MetaLeadAdCampaignListItem } from './types/meta-lead-ad-campaign-list-item.type';

/**
 * Admin registry for Meta Ads → RAG project.
 * Mounted before CustomerAdminController so paths are not captured as `:customerId`.
 */
@Controller('admin/customer/meta-lead-forms/ad-campaigns')
export class MetaLeadAdCampaignsController {
  constructor(
    private readonly metaLeadAdCampaignsService: MetaLeadAdCampaignsService,
  ) {}

  @Get('test')
  testMetaLeadAdCampaigns(): { status: string } {
    return { status: 'meta-lead-ad-campaigns controller alive' };
  }

  @Get()
  listAdCampaigns(
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadAdCampaignListItem[]> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadAdCampaignsService.executeList();
  }

  @Get(':id')
  getAdCampaign(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadAdCampaignListItem> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadAdCampaignsService.executeGetById(id);
  }

  @Post()
  createAdCampaign(
    @Body() body: CreateMetaLeadAdCampaignDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadAdCampaignListItem> {
    assertOfficeAdmin(jwtUser);
    const officeUserId = resolveOfficeUserId(jwtUser);
    return this.metaLeadAdCampaignsService.executeCreate(body, officeUserId);
  }

  @Patch(':id')
  updateAdCampaign(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @Body() body: UpdateMetaLeadAdCampaignDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<MetaLeadAdCampaignListItem> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadAdCampaignsService.executeUpdate(id, body);
  }

  @Delete(':id')
  deleteAdCampaign(
    @Param('id', ParseHexObjectIdPipe) id: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ): Promise<{ readonly deleted: true }> {
    assertOfficeAdmin(jwtUser);
    return this.metaLeadAdCampaignsService.executeDelete(id);
  }
}
