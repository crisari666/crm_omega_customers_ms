import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { CreateWebinarLeadItemDto } from './create-webinar-lead-item.dto';

export class ImportWebinarLeadsDto {
  @IsMongoId()
  webinarEventId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateWebinarLeadItemDto)
  leads: CreateWebinarLeadItemDto[];

  /** When true (default), send WhatsApp registration template per created lead. */
  @IsOptional()
  @IsBoolean()
  sendNotification?: boolean;
}
