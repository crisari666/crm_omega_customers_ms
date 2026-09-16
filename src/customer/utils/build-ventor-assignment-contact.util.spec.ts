import {
  buildVentorAssignmentContactPayload,
  buildVentorAssignmentContactSummary,
} from './build-ventor-assignment-contact.util';
import type { VentorAssignmentCandidate } from '../types/ventor-assignment-candidate.type';

describe('buildVentorAssignmentContactPayload', () => {
  it('prefers phone over phoneJob and strips non-digits for waId', () => {
    const inputVentor: VentorAssignmentCandidate = {
      id: 'v1',
      name: 'Ana',
      lastName: 'López',
      phone: '+57 300 1234567',
      phoneJob: '3009999999',
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
    };
    const actual = buildVentorAssignmentContactPayload(inputVentor);
    expect(actual).toEqual({
      firstName: 'Luis',
      lastName: 'Perez',
      phone: '3009876543',
      waId: '3009876543',
    });
  });

  it('returns null when both phones are empty', () => {
    const inputVentor: VentorAssignmentCandidate = {
      id: 'v1',
      name: 'Ana',
      lastName: 'López',
      phone: '',
      phoneJob: '',
    };
    expect(buildVentorAssignmentContactPayload(inputVentor)).toBeNull();
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
});
