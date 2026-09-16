import { ArrayMaxSize, IsArray, IsMongoId } from 'class-validator';

/**
 * Body for `POST customer/mine/events-summary`.
 */
export class MineEventsSummaryBodyDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  customerIds: string[];
}
