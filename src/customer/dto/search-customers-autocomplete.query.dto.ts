import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Query for `GET admin/customer/search` (autocomplete by name/lastName/phone/document). */
export class SearchCustomersAutocompleteQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}
