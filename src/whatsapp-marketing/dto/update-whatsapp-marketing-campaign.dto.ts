import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsappMarketingCampaignDto } from './create-whatsapp-marketing-campaign.dto';

export class UpdateWhatsappMarketingCampaignDto extends PartialType(
  CreateWhatsappMarketingCampaignDto,
) {}
