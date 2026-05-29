import { MARKETING_RECOVERY_PRESERVED_ASSIGNEE_MESSAGE_TEMPLATE } from '../constants/marketing-recovery-reply-message.constant';

/**
 * Builds the post-reply WhatsApp body when assignee is preserved on a recovery campaign.
 */
export function formatPreservedAssigneeReplyMessageForCustomer(input: {
  readonly userName: string;
  readonly userPhone: string;
}): string {
  return MARKETING_RECOVERY_PRESERVED_ASSIGNEE_MESSAGE_TEMPLATE.replace(
    '[user_name]',
    input.userName.trim(),
  ).replace('[user_phone]', input.userPhone.trim());
}
