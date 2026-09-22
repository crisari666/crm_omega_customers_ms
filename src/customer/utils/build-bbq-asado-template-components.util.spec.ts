import { buildBbqAsadoTemplateComponents } from './build-bbq-asado-template-components.util';

describe('buildBbqAsadoTemplateComponents', () => {
  it('builds body with contact_name parameter', () => {
    const actual = buildBbqAsadoTemplateComponents('John');
    expect(actual).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'John', parameter_name: 'contact_name' },
        ],
      },
    ]);
  });

  it('falls back to Cliente when name is blank', () => {
    const actual = buildBbqAsadoTemplateComponents('   ');
    expect(actual[0]).toMatchObject({
      parameters: [{ text: 'Cliente', parameter_name: 'contact_name' }],
    });
  });
});
