import { IsIn, IsString, MaxLength } from 'class-validator';

/** One transcript message of the simulated conversation. */
export class SimulatedTranscriptMessageDto {
  @IsIn(['inbound', 'outbound'])
  direction: 'inbound' | 'outbound';

  @IsString()
  @MaxLength(4000)
  body: string;
}
