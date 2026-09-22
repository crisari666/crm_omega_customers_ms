import { isBbqAsadoFormName } from './is-bbq-asado-form-name.util';

describe('isBbqAsadoFormName', () => {
  it('matches Formulario_Asado prefix case-insensitively', () => {
    expect(isBbqAsadoFormName('Formulario_Asado')).toBe(true);
    expect(isBbqAsadoFormName('formulario_asado_sept')).toBe(true);
  });

  it('rejects other form names', () => {
    expect(isBbqAsadoFormName('datos_clientes')).toBe(false);
    expect(isBbqAsadoFormName(undefined)).toBe(false);
  });
});
