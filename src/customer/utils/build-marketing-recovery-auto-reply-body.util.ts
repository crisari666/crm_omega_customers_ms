import { formatVentorAssignmentMessageForCustomer } from './format-ventor-assignment-message.util';
import { formatPreservedAssigneeReplyMessageForCustomer } from './format-marketing-recovery-reply-message.util';

export type MarketingRecoveryAutoReplyKind = 'preserve' | 'assign' | 'none';

export type MarketingRecoveryAutoReplyVentorDisplay = {
  readonly userName: string;
  readonly userPhone: string;
};

export function resolveMarketingRecoveryAutoReplyKind(input: {
  readonly didPreserveAssignee: boolean;
  readonly didAssignVentor: boolean;
}): MarketingRecoveryAutoReplyKind {
  if (input.didPreserveAssignee) {
    return 'preserve';
  }
  if (input.didAssignVentor) {
    return 'assign';
  }
  return 'none';
}

export function buildMarketingRecoveryAutoReplyBody(input: {
  readonly kind: MarketingRecoveryAutoReplyKind;
  readonly ventorDisplay: MarketingRecoveryAutoReplyVentorDisplay;
}): string | null {
  if (input.kind === 'none') {
    return null;
  }
  const userName =
    input.ventorDisplay.userName.trim().length > 0
      ? input.ventorDisplay.userName.trim()
      : 'tu asesor';
  const userPhone =
    input.ventorDisplay.userPhone.trim().length > 0
      ? input.ventorDisplay.userPhone.trim()
      : '-';
  if (input.kind === 'preserve') {
    return formatPreservedAssigneeReplyMessageForCustomer({ userName, userPhone });
  }
  return formatVentorAssignmentMessageForCustomer({ userName, userPhone });
}
