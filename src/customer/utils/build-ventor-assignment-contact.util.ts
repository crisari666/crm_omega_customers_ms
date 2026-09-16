import type { VentorAssignmentCandidate } from '../types/ventor-assignment-candidate.type';
import type { PotentialCustomersContactPayload } from '../types/potential-customers-ms-event.type';
import { VENTOR_ASSIGNMENT_CONTACT_GREETING_TEMPLATE } from '../constants/ventor-assignment-contact-greeting.constant';

export type VentorAssignmentWhatsAppBundle = {
  readonly contact: PotentialCustomersContactPayload;
  readonly body: string;
};

/**
 * Builds the Spanish greeting that introduces the ventor contact card.
 */
export function formatVentorAssignmentContactGreeting(input: {
  readonly userName: string;
}): string {
  const userName: string =
    input.userName.trim().length > 0 ? input.userName.trim() : 'tu asesor';
  return VENTOR_ASSIGNMENT_CONTACT_GREETING_TEMPLATE.replace('[user_name]', userName);
}

/**
 * Maps a ventor assignment candidate to the WhatsApp contacts payload fields.
 */
export function buildVentorAssignmentContactPayload(
  ventor: VentorAssignmentCandidate,
): PotentialCustomersContactPayload | null {
  const firstName: string = ventor.name.trim();
  const lastName: string = ventor.lastName.trim();
  const phone: string =
    ventor.phone.trim().length > 0 ? ventor.phone.trim() : ventor.phoneJob.trim();
  if (phone.length === 0) {
    return null;
  }
  const waId: string = phone.replace(/\D/g, '');
  return {
    firstName: firstName.length > 0 ? firstName : 'Asesor',
    lastName,
    phone,
    waId: waId.length > 0 ? waId : undefined,
  };
}

/**
 * Greeting text + contact card fields for ventor assignment WhatsApp.
 */
export function buildVentorAssignmentWhatsAppBundle(
  ventor: VentorAssignmentCandidate,
): VentorAssignmentWhatsAppBundle | null {
  const contact = buildVentorAssignmentContactPayload(ventor);
  if (contact == null) {
    return null;
  }
  const displayName: string = `${contact.firstName} ${contact.lastName}`.trim();
  return {
    contact,
    body: formatVentorAssignmentContactGreeting({
      userName: displayName.length > 0 ? displayName : 'tu asesor',
    }),
  };
}

/**
 * Short conversation-log summary for an outbound ventor contact card.
 */
export function buildVentorAssignmentContactSummary(
  contact: PotentialCustomersContactPayload,
): string {
  const displayName: string = `${contact.firstName} ${contact.lastName}`.trim();
  const formattedName: string =
    displayName.length > 0
      ? `${displayName} (Asesor La Ceiba)`
      : 'Asesor La Ceiba';
  return `Contacto: ${formattedName} — ${contact.phone}`;
}
