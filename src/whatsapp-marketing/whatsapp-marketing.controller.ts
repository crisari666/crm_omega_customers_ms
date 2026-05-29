import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtUser } from '../core/decorators/jwt-user.decorator';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { assertOfficeAdmin } from '../core/utils/assert-office-admin.util';
import { ParseHexObjectIdPipe } from '../core/pipes/parse-hex-object-id.pipe';
import { AudiencePreviewBodyDto } from './dto/audience-preview.dto';
import { CreateWhatsappMarketingCampaignDto } from './dto/create-whatsapp-marketing-campaign.dto';
import { UpdateWhatsappMarketingCampaignDto } from './dto/update-whatsapp-marketing-campaign.dto';
import { ListWhatsappMarketingCampaignsQueryDto } from './dto/list-whatsapp-marketing-campaigns.query.dto';
import { ListWhatsappMarketingRecipientsQueryDto } from './dto/list-whatsapp-marketing-recipients.query.dto';
import { WhatsappMarketingCampaignService } from './whatsapp-marketing-campaign.service';

@Controller('admin/whatsapp-marketing')
export class WhatsappMarketingController {
  constructor(private readonly campaignService: WhatsappMarketingCampaignService) {}

  @Post('audience-preview')
  previewAudience(@Body() body: AudiencePreviewBodyDto) {
    return this.campaignService.executePreviewAudience(body);
  }

  @Post('campaigns')
  createCampaign(
    @Body() body: CreateWhatsappMarketingCampaignDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.campaignService.executeCreateDraft(body, resolveOfficeUserId(jwtUser));
  }

  @Patch('campaigns/:campaignId')
  updateCampaign(
    @Param('campaignId', ParseHexObjectIdPipe) campaignId: string,
    @Body() body: UpdateWhatsappMarketingCampaignDto,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.campaignService.executeUpdateDraft(
      campaignId,
      body,
      resolveOfficeUserId(jwtUser),
    );
  }

  @Get('campaigns')
  listCampaigns(@Query() query: ListWhatsappMarketingCampaignsQueryDto) {
    return this.campaignService.executeListCampaigns(query);
  }

  @Get('campaigns/:campaignId')
  getCampaign(@Param('campaignId', ParseHexObjectIdPipe) campaignId: string) {
    return this.campaignService.executeGetCampaign(campaignId);
  }

  @Get('campaigns/:campaignId/recipients')
  listRecipients(
    @Param('campaignId', ParseHexObjectIdPipe) campaignId: string,
    @Query() query: ListWhatsappMarketingRecipientsQueryDto,
  ) {
    return this.campaignService.executeListRecipients(campaignId, query);
  }

  @Post('campaigns/:campaignId/launch')
  launchCampaign(
    @Param('campaignId', ParseHexObjectIdPipe) campaignId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.campaignService.executeLaunchCampaign(campaignId, resolveOfficeUserId(jwtUser));
  }

  @Post('campaigns/:campaignId/cancel')
  cancelCampaign(
    @Param('campaignId', ParseHexObjectIdPipe) campaignId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.campaignService.executeCancelCampaign(campaignId, resolveOfficeUserId(jwtUser));
  }

  @Post('campaigns/:campaignId/recipients/:recipientId/retry')
  retryRecipient(
    @Param('campaignId', ParseHexObjectIdPipe) campaignId: string,
    @Param('recipientId', ParseHexObjectIdPipe) recipientId: string,
    @JwtUser() jwtUser: OfficeJwtPayload | undefined,
  ) {
    assertOfficeAdmin(jwtUser);
    return this.campaignService.executeRetryRecipient(
      campaignId,
      recipientId,
      resolveOfficeUserId(jwtUser),
    );
  }
}
