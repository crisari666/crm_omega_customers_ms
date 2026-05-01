import { IsIn, IsOptional } from 'class-validator';

/** Sort mode for `GET customer/mine`. */
export class ListCustomerMineQueryDto {
  @IsOptional()
  @IsIn(['createdAt', 'lastUpdate'])
  sort?: 'createdAt' | 'lastUpdate';
}
