import { VENTOR_ASSIGNMENT_CUSTOMER_MESSAGE_TEMPLATE } from '../constants/ventor-assignment-message.constant';

/**
 * Builds the post-assignment WhatsApp body for the customer.
 */
export function formatVentorAssignmentMessageForCustomer(input: {
  readonly userName: string;
  readonly userPhone: string;
}): string {
  return VENTOR_ASSIGNMENT_CUSTOMER_MESSAGE_TEMPLATE.replace('[user_name]', input.userName.trim()).replace(
    '[user_phone]',
    input.userPhone.trim(),
  );
}
