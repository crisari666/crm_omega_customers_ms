import { IsMongoId } from 'class-validator';

/**
 * Body for assigning the customer's pipeline step (separate from general `PATCH customer/:id`).
 */
export class SetCustomerStepDto {
  @IsMongoId()
  customerStepId: string;
}
