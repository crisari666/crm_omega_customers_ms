import { IsOptional, IsString, MaxLength } from 'class-validator';

const MAX_USER_ID_LENGTH = 64;

/** Target advance-leads user; omitted → least-loaded free user at that slot. */
export class ReassignLeadCallDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_USER_ID_LENGTH)
  userId?: string;
}
