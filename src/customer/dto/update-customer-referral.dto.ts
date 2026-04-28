import { IsBoolean } from 'class-validator';

export class UpdateCustomerReferralDto {
  @IsBoolean()
  isReferral: boolean;
}
