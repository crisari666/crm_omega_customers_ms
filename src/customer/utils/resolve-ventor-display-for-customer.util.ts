import type { VentorAssignmentCandidate } from '../types/ventor-assignment-candidate.type';
import type { MarketingRecoveryAutoReplyVentorDisplay } from './build-marketing-recovery-auto-reply-body.util';

/**
 * Maps office_back ventor candidate to WhatsApp message placeholders.
 */
export function resolveVentorDisplayForCustomer(
  ventor: VentorAssignmentCandidate,
): MarketingRecoveryAutoReplyVentorDisplay {
  const displayName = `${ventor.name} ${ventor.lastName}`.trim();
  const phone =
    ventor.phone.trim().length > 0 ? ventor.phone.trim() : ventor.phoneJob.trim();
  return {
    userName: displayName.length > 0 ? displayName : 'tu asesor',
    userPhone: phone.length > 0 ? phone : '-',
  };
}
