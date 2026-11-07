import { parseMetaLeadMessages } from './parse-meta-lead-messages.util';

const CTWA_FORM_BODY = `¡Hola! He completado el formulario y me gustaría recibir más información sobre vuestro negocio.

Full name: Andres Palomino
¿Cuánto tienes disponible para invertir?: Entre $1’000.000 COP y $35’000.000 COP
City: bogota
Phone number: +573182620113
¿Tienes conocimiento de que nuestro proyecto está ubicado en Carmen de Apicalá, Tolima?: Si
Email: andresfelipe.lugo@outlook.com
Inbox URL:`;

describe('parseMetaLeadMessages', () => {
  it('resolves CTWA form messages without message.from via phone in text body', () => {
    const input = {
      source: 'lead_conversation',
      payload: {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: '1031088740092803' },
                  contacts: [
                    {
                      profile: { name: 'Pipe', username: 'Pipepalo28' },
                      user_id: 'CO.4513634245617612',
                    },
                  ],
                  messages: [
                    {
                      id: 'wamid.ctwa-test',
                      from_user_id: 'CO.4513634245617612',
                      timestamp: '1794078600',
                      type: 'text',
                      referral: { ctwa_clid: 'AfgKBszs-test-clid' },
                      text: { body: CTWA_FORM_BODY },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };
    const actual = parseMetaLeadMessages(input);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toMatchObject({
      wamid: 'wamid.ctwa-test',
      waId: '573182620113',
      phoneNumberId: '1031088740092803',
      profileName: 'Andres Palomino',
      email: 'andresfelipe.lugo@outlook.com',
      whatsappUsername: 'Pipepalo28',
      metaWhatsappUserId: 'CO.4513634245617612',
      ctwaClid: 'AfgKBszs-test-clid',
      isInstantFormDump: true,
    });
  });

  it('parses Fabian Pinilla Instant Form dump with Bogotá and curly apostrophes', () => {
    const body = `¡Hola! He completado el formulario y me gustaría recibir más información sobre vuestro negocio.

Full name: Fabian Pinilla
¿Cuánto tienes disponible para invertir?: Entre $1’000.000 COP y $35’000.000 COP
City: Bogotá
Phone number: +573102488075
¿Tienes conocimiento de que nuestro proyecto está ubicado en Carmen de Apicalá, Tolima?: Si
Email: nestor004@hotmail.com
Inbox URL:`;
    const actual = parseMetaLeadMessages({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '1031088740092803' },
                contacts: [{ profile: { name: 'Fab', username: 'fabianwa' }, user_id: 'CO.fabian' }],
                messages: [
                  {
                    id: 'wamid.fabian',
                    from_user_id: 'CO.fabian',
                    timestamp: '1794078600',
                    type: 'text',
                    text: { body },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(actual).toHaveLength(1);
    expect(actual[0]).toMatchObject({
      waId: '573102488075',
      profileName: 'Fabian Pinilla',
      email: 'nestor004@hotmail.com',
      whatsappUsername: 'fabianwa',
      metaWhatsappUserId: 'CO.fabian',
      isInstantFormDump: true,
    });
  });

  it('prefers message.from over phone embedded in text', () => {
    const actual = parseMetaLeadMessages({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '1' },
                contacts: [{ wa_id: '573001112233', profile: { name: 'Ana' } }],
                messages: [
                  {
                    id: 'wamid.from',
                    from: '573001112233',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Hola\nPhone number: +573999999999' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(actual).toHaveLength(1);
    expect(actual[0].waId).toBe('573001112233');
    expect(actual[0].profileName).toBe('Ana');
  });

  it('returns empty when there is no from and no recoverable phone', () => {
    const actual = parseMetaLeadMessages({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messages: [
                  {
                    id: 'wamid.no-phone',
                    from_user_id: 'CO.only',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Hola sin teléfono' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(actual).toEqual([]);
  });
});
