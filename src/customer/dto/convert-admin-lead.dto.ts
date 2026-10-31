import { IsOptional, IsString, MaxLength } from 'class-validator';

const MAX_USER_ID_LENGTH = 64;

/** Body for `POST /admin/customer/leads/:id/convert`. */
export class ConvertAdminLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_USER_ID_LENGTH)
  assignToUserId?: string;
}
