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

/**
 * Builds the text auto-reply body for marketing recovery.
 * Only `preserve` uses text; `assign` sends a contacts card via a separate path.
 */
export function buildMarketingRecoveryAutoReplyBody(input: {
  readonly kind: MarketingRecoveryAutoReplyKind;
  readonly ventorDisplay: MarketingRecoveryAutoReplyVentorDisplay;
}): string | null {
  if (input.kind !== 'preserve') {
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
  return formatPreservedAssigneeReplyMessageForCustomer({ userName, userPhone });
}
