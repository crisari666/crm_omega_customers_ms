import { IsString } from 'class-validator';

/**
 * Body for PATCH `admin/customer/:customerId/assignee`.
 * Empty string clears the assignee (`assignedTo`).
 */
export class AssignCustomerAssigneeDto {
  @IsString()
  assignedTo: string;
}
