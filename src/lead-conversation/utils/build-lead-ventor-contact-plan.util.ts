import type { VentorAssignmentCandidate } from '../../customer/types/ventor-assignment-candidate.type';
import type { OutboundContact, OutboundContactPhone } from '../types/outbound-contact.type';

/**
 * Maps an advance-leads ventor to Meta contacts phones: `phone` → CELL, `phoneJob` → WORK.
 * Returns null when neither phone is set.
 */
export function buildLeadVentorContact(ventor: VentorAssignmentCandidate): OutboundContact | null {
  const phones: OutboundContactPhone[] = [];
  const cell = ventor.phone.trim();
  if (cell.length > 0) {
    const waId = cell.replace(/\D/g, '');
    phones.push({
      phone: cell,
      type: 'CELL',
      ...(waId.length > 0 ? { waId } : {}),
    });
  }
  const work = ventor.phoneJob.trim();
  if (work.length > 0) {
    const waId = work.replace(/\D/g, '');
    phones.push({
      phone: work,
      type: 'WORK',
      ...(waId.length > 0 ? { waId } : {}),
    });
  }
  if (phones.length === 0) return null;
  const firstName = ventor.name.trim();
  const lastName = ventor.lastName.trim();
  return {
    firstName: firstName.length > 0 ? firstName : 'Asesor',
    lastName,
    phones,
  };
}

/** Human-readable transcript summary for an outbound ventor contact card. */
export function buildLeadVentorContactSummary(contact: OutboundContact): string {
  const displayName = `${contact.firstName} ${contact.lastName}`.trim();
  const formattedName =
    displayName.length > 0 ? `${displayName} (Asesor La Ceiba)` : 'Asesor La Ceiba';
  const phones = contact.phones.map((entry) => entry.phone).join(', ');
  return `Contacto: ${formattedName} — ${phones}`;
}

/** Display name for confirmation copy. */
export function formatLeadVentorDisplayName(ventor: VentorAssignmentCandidate): string {
  const displayName = `${ventor.name.trim()} ${ventor.lastName.trim()}`.trim();
  return displayName.length > 0 ? displayName : 'tu asesor';
}
