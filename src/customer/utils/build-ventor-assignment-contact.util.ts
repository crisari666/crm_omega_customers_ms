import type { VentorAssignmentCandidate } from '../types/ventor-assignment-candidate.type';
import type { PotentialCustomersContactPayload } from '../types/potential-customers-ms-event.type';

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
