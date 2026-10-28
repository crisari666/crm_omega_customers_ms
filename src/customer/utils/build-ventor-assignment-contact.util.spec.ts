import {
  buildVentorAssignmentContactPayload,
  buildVentorAssignmentContactSummary,
  buildVentorAssignmentWhatsAppBundle,
  formatVentorAssignmentContactGreeting,
} from './build-ventor-assignment-contact.util';
import { VENTOR_ASSIGNMENT_CONTACT_GREETING_TEMPLATE } from '../constants/ventor-assignment-contact-greeting.constant';
import type { VentorAssignmentCandidate } from '../types/ventor-assignment-candidate.type';

describe('buildVentorAssignmentContactPayload', () => {
  it('prefers phone over phoneJob and strips non-digits for waId', () => {
    const inputVentor: VentorAssignmentCandidate = {
      id: 'v1',
      name: 'Ana',
      lastName: 'López',
      phone: '+57 300 1234567',
      phoneJob: '3009999999',
      voipPhone: '',
    };
    const actual = buildVentorAssignmentContactPayload(inputVentor);
    expect(actual).toEqual({
      firstName: 'Ana',
      lastName: 'López',
      phone: '+57 300 1234567',
      waId: '573001234567',
    });
  });

  it('falls back to phoneJob when phone is empty', () => {
    const inputVentor: VentorAssignmentCandidate = {
      id: 'v1',
      name: 'Luis',
      lastName: 'Perez',
      phone: '  ',
      phoneJob: '3009876543',
      voipPhone: '',
    };
    const actual = buildVentorAssignmentContactPayload(inputVentor);
    expect(actual).toEqual({
      firstName: 'Luis',
      lastName: 'Perez',
      phone: '3009876543',
      waId: '3009876543',
    });
  });

  it('includes voipPhone when present', () => {
    const inputVentor: VentorAssignmentCandidate = {
      id: 'v1',
      name: 'Ana',
      lastName: 'López',
      phone: '3001234567',
      phoneJob: '',
      voipPhone: '+573009998877',
    };
    const actual = buildVentorAssignmentContactPayload(inputVentor);
    expect(actual).toEqual({
      firstName: 'Ana',
      lastName: 'López',
      phone: '3001234567',
      waId: '3001234567',
      voipPhone: '+573009998877',
    });
  });

  it('returns null when both phones are empty', () => {
    const inputVentor: VentorAssignmentCandidate = {
      id: 'v1',
      name: 'Ana',
      lastName: 'López',
      phone: '',
      phoneJob: '',
      voipPhone: '+573001112233',
    };
    expect(buildVentorAssignmentContactPayload(inputVentor)).toBeNull();
  });
});

describe('formatVentorAssignmentContactGreeting', () => {
  it('replaces the advisor name placeholder', () => {
    const actual = formatVentorAssignmentContactGreeting({ userName: 'Ana López' });
    expect(actual).toBe(
      VENTOR_ASSIGNMENT_CONTACT_GREETING_TEMPLATE.replace('[user_name]', 'Ana López'),
    );
  });
});

describe('buildVentorAssignmentWhatsAppBundle', () => {
  it('returns greeting body plus contact fields', () => {
    const inputVentor: VentorAssignmentCandidate = {
      id: 'v1',
      name: 'Ana',
      lastName: 'López',
      phone: '3001234567',
      phoneJob: '',
      voipPhone: '+573009998877',
    };
    const actual = buildVentorAssignmentWhatsAppBundle(inputVentor);
    expect(actual).toEqual({
      contact: {
        firstName: 'Ana',
        lastName: 'López',
        phone: '3001234567',
        waId: '3001234567',
        voipPhone: '+573009998877',
      },
      body: VENTOR_ASSIGNMENT_CONTACT_GREETING_TEMPLATE.replace('[user_name]', 'Ana López'),
    });
  });
});

describe('buildVentorAssignmentContactSummary', () => {
  it('builds a short summary for conversation persistence', () => {
    const actual = buildVentorAssignmentContactSummary({
      firstName: 'Ana',
      lastName: 'López',
      phone: '3001234567',
    });
    expect(actual).toBe('Contacto: Ana López (Asesor La Ceiba) — 3001234567');
  });

  it('appends voipPhone in the summary when present', () => {
    const actual = buildVentorAssignmentContactSummary({
      firstName: 'Ana',
      lastName: 'López',
      phone: '3001234567',
      voipPhone: '+573009998877',
    });
    expect(actual).toBe('Contacto: Ana López (Asesor La Ceiba) — 3001234567, +573009998877');
  });
});
