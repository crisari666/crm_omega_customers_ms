import {
  extractFormFieldsFromLeadText,
  isInstantFormDump,
  mapInvestmentRangeToCapacityCode,
} from './extract-form-fields-from-lead-text.util';
import { extractPhoneFromLeadText } from './extract-phone-from-lead-text.util';

const FABIAN_FORM_BODY = `¡Hola! He completado el formulario y me gustaría recibir más información sobre vuestro negocio.

Full name: Fabian Pinilla
¿Cuánto tienes disponible para invertir?: Entre $1’000.000 COP y $35’000.000 COP
City: Bogotá
Phone number: +573102488075
¿Tienes conocimiento de que nuestro proyecto está ubicado en Carmen de Apicalá, Tolima?: Si
Email: nestor004@hotmail.com
Inbox URL:`;

const REJECT_FORM_BODY = `¡Hola! He completado el formulario y me gustaría recibir más información sobre vuestro negocio.

Full name: Carolina Zambrano
¿Cuánto tienes disponible para invertir?: Entre $15’000.000 COP y $35’000.000 COP
City: Bogotá
Phone number: +573214859261
¿Tienes conocimiento de que nuestro proyecto está ubicado en Carmen de Apicalá, Tolima?: No, busco un lote en otra ciudad
Email: carola_918@hotmail.com`;

describe('extract-form-fields-from-lead-text', () => {
  it('detects Instant Form dump and extracts identity plus capture fields', () => {
    expect(isInstantFormDump(FABIAN_FORM_BODY)).toBe(true);
    expect(extractFormFieldsFromLeadText(FABIAN_FORM_BODY)).toEqual({
      fullName: 'Fabian Pinilla',
      email: 'nestor004@hotmail.com',
      city: 'Bogotá',
      economicCapacity: '10_20m',
      rejectsSuggestedLocation: false,
    });
    expect(extractPhoneFromLeadText(FABIAN_FORM_BODY)).toBe('573102488075');
  });

  it('flags location rejection when the form seeks another city', () => {
    expect(extractFormFieldsFromLeadText(REJECT_FORM_BODY)).toEqual(
      expect.objectContaining({
        city: 'Bogotá',
        economicCapacity: '20_30m',
        rejectsSuggestedLocation: true,
      }),
    );
  });

  it('maps investment ranges to the nearest catalog capacity code', () => {
    expect(
      mapInvestmentRangeToCapacityCode(
        '¿Cuánto tienes disponible para invertir?: Entre $15’000.000 COP y $35’000.000 COP',
      ),
    ).toBe('20_30m');
  });

  it('does not treat a short free-form reply as Instant Form dump', () => {
    expect(isInstantFormDump('Hola, me interesa Parque del Agua')).toBe(false);
  });
});
