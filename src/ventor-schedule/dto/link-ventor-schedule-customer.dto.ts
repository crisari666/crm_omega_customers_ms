import { IsMongoId } from 'class-validator';

/** Body for PATCH ventor-schedule/:id/customer — relate a lead call to an existing Customer. */
export class LinkVentorScheduleCustomerDto {
  @IsMongoId()
  customerId: string;
}
