import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class ListWhatsappMarketingRecipientsQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'replied'])
  status?:
    | 'pending'
    | 'sending'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'failed'
    | 'cancelled'
    | 'replied';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
