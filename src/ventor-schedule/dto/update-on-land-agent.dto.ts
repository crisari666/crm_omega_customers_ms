import { IsString, ValidateIf } from 'class-validator';

export class UpdateOnLandAgentDto {
  /** Pass `null` to clear the assigned on-land agent. */
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  onLandAgentUserId: string | null;
}
