import { IsObject } from 'class-validator';

/**
 * Body for upserting Stage 3 customer metadata values.
 */
export class UpsertCustomerMetadataDto {
  @IsObject()
  values: Record<string, string>;
}
