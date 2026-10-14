import { REPLY_ID } from '../constants/lead-conversation.constants';
import type { LeadProject } from '../types/lead-project.type';
import { matchOptionByText } from './match-option-by-text.util';
import { matchProjectByText } from './match-project-by-text.util';
import { parseMetaLeadMessages } from './parse-meta-lead-messages.util';

const buildProject = (id: string, title: string): LeadProject => ({
  id,
  title,
  shortDescription: '',
  plane: '',
  lotOptions: [],
});

describe('matchProjectByText', () => {
  const projects = [
    buildProject('1', 'Valle del Sol'),
    buildProject('2', 'Villas del Olimpo'),
    buildProject('3', 'Parque del Agua'),
  ];

  it('matches a full title with accents/case differences', () => {
    expect(matchProjectByText('Hola, quiero info de VALLE DEL SOL!', projects)?.id).toBe('1');
  });

  it('matches by significant token overlap', () => {
    expect(matchProjectByText('me interesa olimpo', projects)?.id).toBe('2');
  });

  it('returns undefined for greetings', () => {
    expect(matchProjectByText('Hola buenas tardes', projects)).toBeUndefined();
  });
});

describe('matchOptionByText', () => {
  const paymentOptions = [
    { id: REPLY_ID.paymentFinanced, title: '💰 Financiado' },
    { id: REPLY_ID.paymentCash, title: '💵 De contado' },
  ];

  it('matches keywords when the customer types', () => {
    expect(matchOptionByText('quiero pagar en cuotas', paymentOptions)?.id).toBe(REPLY_ID.paymentFinanced);
    expect(matchOptionByText('de contado', paymentOptions)?.id).toBe(REPLY_ID.paymentCash);
  });

  it('matches lot sizes by number', () => {
    const lotOptions = [
      { id: 'lot:300', title: '300 m²' },
      { id: 'lot:1000', title: '1.000 m²' },
    ];
    expect(matchOptionByText('el de 300', lotOptions)?.id).toBe('lot:300');
  });

  it('maps "si" to the reminder yes option', () => {
    const reminderOptions = [
      { id: REPLY_ID.reminderYes, title: 'Sí' },
      { id: REPLY_ID.reminderNo, title: 'No' },
    ];
    expect(matchOptionByText('Sí', reminderOptions)?.id).toBe(REPLY_ID.reminderYes);
    expect(matchOptionByText('no gracias', reminderOptions)?.id).toBe(REPLY_ID.reminderNo);
  });
});

describe('parseMetaLeadMessages', () => {
  it('parses button replies from a gateway envelope and ignores statuses', () => {
    const inputEnvelope = {
      source: 'lead_conversation',
      payload: {
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: '111' },
                  contacts: [{ wa_id: '573001112233', profile: { name: 'ana maria' } }],
                  messages: [
                    {
                      id: 'wamid.1',
                      from: '573001112233',
                      timestamp: '1760000000',
                      type: 'interactive',
                      interactive: { type: 'button_reply', button_reply: { id: 'pay:cash', title: '💵 De contado' } },
                    },
                  ],
                  statuses: [{ id: 'wamid.0', status: 'read' }],
                },
              },
            ],
          },
        ],
      },
    };
    const actual = parseMetaLeadMessages(inputEnvelope);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toMatchObject({ wamid: 'wamid.1', replyId: 'pay:cash', profileName: 'ana maria', phoneNumberId: '111' });
  });
});
