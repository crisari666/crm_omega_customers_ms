import { ArrayMinSize, IsArray, IsDateString, IsMongoId, IsObject, IsOptional } from 'class-validator';

/**
 * Body for staff performance: caller supplies physical staff user ids (and optional display labels).
 */
export class StaffPerformanceBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  userIds: string[];

  /**
   * Optional map userId → display name (e.g. from CRM user list when office is selected).
   */
  @IsOptional()
  @IsObject()
  userDisplayNames?: Record<string, string>;

  @IsDateString()
  assignedFrom: string;

  @IsDateString()
  assignedTo: string;

  @IsOptional()
  @IsDateString()
  callFrom?: string;

  @IsOptional()
  @IsDateString()
  callTo?: string;
}
