import {
  buildLeadVentorContact,
  buildLeadVentorContactSummary,
  formatLeadVentorDisplayName,
} from './build-lead-ventor-contact-plan.util';

describe('buildLeadVentorContact', () => {
  it('maps phone to CELL and phoneJob to WORK', () => {
    const actual = buildLeadVentorContact({
      id: 'u1',
      name: 'Ana',
      lastName: 'López',
      phone: '+57 300 111 2233',
      phoneJob: '6015551212',
      voipPhone: '',
    });
    expect(actual).toEqual({
      firstName: 'Ana',
      lastName: 'López',
      phones: [
        { phone: '+57 300 111 2233', type: 'CELL', waId: '573001112233' },
        { phone: '6015551212', type: 'WORK', waId: '6015551212' },
      ],
    });
  });

  it('appends voipPhone as MAIN after CELL/WORK', () => {
    const actual = buildLeadVentorContact({
      id: 'u1',
      name: 'Ana',
      lastName: 'López',
      phone: '3001112233',
      phoneJob: '6015551212',
      voipPhone: '+573009998877',
    });
    expect(actual?.phones).toEqual([
      { phone: '3001112233', type: 'CELL', waId: '3001112233' },
      { phone: '6015551212', type: 'WORK', waId: '6015551212' },
      { phone: '+573009998877', type: 'MAIN', waId: '573009998877' },
    ]);
  });

  it('returns a single phone when only phoneJob is set', () => {
    const actual = buildLeadVentorContact({
      id: 'u1',
      name: 'Ana',
      lastName: '',
      phone: '  ',
      phoneJob: '3009998877',
      voipPhone: '',
    });
    expect(actual?.phones).toEqual([{ phone: '3009998877', type: 'WORK', waId: '3009998877' }]);
  });

  it('returns null when neither WhatsApp nor phoneJob is set', () => {
    expect(
      buildLeadVentorContact({
        id: 'u1',
        name: 'Ana',
        lastName: 'López',
        phone: '',
        phoneJob: '',
        voipPhone: '+573001112233',
      }),
    ).toBeNull();
  });
});

describe('buildLeadVentorContactSummary', () => {
  it('joins name and phones for the transcript', () => {
    const actual = buildLeadVentorContactSummary({
      firstName: 'Ana',
      lastName: 'López',
      phones: [
        { phone: '3001112233', type: 'CELL' },
        { phone: '6015551212', type: 'WORK' },
        { phone: '+573009998877', type: 'MAIN' },
      ],
    });
    expect(actual).toBe(
      'Contacto: Ana López (Asesor La Ceiba) — 3001112233, 6015551212, +573009998877',
    );
  });
});

describe('formatLeadVentorDisplayName', () => {
  it('returns full name or fallback', () => {
    expect(
      formatLeadVentorDisplayName({
        id: 'u1',
        name: 'Ana',
        lastName: 'López',
        phone: '',
        phoneJob: '',
        voipPhone: '',
      }),
    ).toBe('Ana López');
    expect(
      formatLeadVentorDisplayName({
        id: 'u1',
        name: '',
        lastName: '',
        phone: '',
        phoneJob: '',
        voipPhone: '',
      }),
    ).toBe('tu asesor');
  });
});
