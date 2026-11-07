import {
  extractFormFieldsFromLeadText,
  isInstantFormDump,
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

describe('extract-form-fields-from-lead-text', () => {
  it('detects Instant Form dump and extracts Fabian Pinilla identity fields', () => {
    expect(isInstantFormDump(FABIAN_FORM_BODY)).toBe(true);
    expect(extractFormFieldsFromLeadText(FABIAN_FORM_BODY)).toEqual({
      fullName: 'Fabian Pinilla',
      email: 'nestor004@hotmail.com',
    });
    expect(extractPhoneFromLeadText(FABIAN_FORM_BODY)).toBe('573102488075');
  });

  it('does not treat a short free-form reply as Instant Form dump', () => {
    expect(isInstantFormDump('Hola, me interesa Parque del Agua')).toBe(false);
  });
});
