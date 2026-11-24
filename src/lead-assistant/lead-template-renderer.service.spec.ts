import type { LeadTemplateRef } from '../lead-conversation/types/lead-template-ref.type';
import { LeadTemplateRendererService } from './lead-template-renderer.service';
import type { LeadTemplateRenderContext } from './types/lead-template-render-context.type';

const baseContext: LeadTemplateRenderContext = {
  firstName: 'Ana',
  assistantName: 'Verónica',
  businessName: 'La Ceiba',
  projectTitle: 'Lotes Campestres',
};

describe('LeadTemplateRendererService', () => {
  const service = new LeadTemplateRendererService();

  it('renders named parameters with parameter_name', () => {
    const inputTemplate: LeadTemplateRef = {
      name: 'welcome',
      language: 'es',
      bodyText: 'Hola {{customer_name}}, soy {{assistant}} de {{business}}',
      bindings: [
        { variable: 'customer_name', component: 'body', format: 'named', source: 'customer_first_name' },
        { variable: 'assistant', component: 'body', format: 'named', source: 'assistant_name' },
        { variable: 'business', component: 'body', format: 'named', source: 'business_name' },
      ],
    };
    const actual = service.executeRender(inputTemplate, baseContext);
    expect(actual.templateComponents).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ana', parameter_name: 'customer_name' },
          { type: 'text', text: 'Verónica', parameter_name: 'assistant' },
          { type: 'text', text: 'La Ceiba', parameter_name: 'business' },
        ],
      },
    ]);
    expect(actual.renderedBody).toBe('Hola Ana, soy Verónica de La Ceiba');
  });

  it('orders positional parameters by number and omits parameter_name', () => {
    const inputTemplate: LeadTemplateRef = {
      name: 'followup',
      language: 'es',
      bodyText: '{{2}} te espera en {{1}}',
      bindings: [
        { variable: '2', component: 'body', format: 'positional', source: 'assistant_name' },
        { variable: '10', component: 'body', format: 'positional', source: 'static', staticValue: 'diez' },
        { variable: '1', component: 'body', format: 'positional', source: 'project_title' },
      ],
    };
    const actual = service.executeRender(inputTemplate, baseContext);
    expect(actual.templateComponents).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Lotes Campestres' },
          { type: 'text', text: 'Verónica' },
          { type: 'text', text: 'diez' },
        ],
      },
    ]);
    expect(actual.renderedBody).toBe('Verónica te espera en Lotes Campestres');
  });

  it('builds one component per component with bindings, header first', () => {
    const inputTemplate: LeadTemplateRef = {
      name: 'with_header',
      language: 'es',
      bodyText: 'Cuerpo {{x}}',
      bindings: [
        { variable: 'x', component: 'body', format: 'named', source: 'static', staticValue: 'v' },
        { variable: 'h', component: 'header', format: 'named', source: 'business_name' },
      ],
    };
    const actual = service.executeRender(inputTemplate, baseContext);
    expect(actual.templateComponents.map((component) => component.type)).toEqual(['header', 'body']);
  });

  it('returns no components when there are no bindings', () => {
    const actual = service.executeRender(
      { name: 'plain', language: 'es', bodyText: 'Hola', bindings: [] },
      baseContext,
    );
    expect(actual).toEqual({ templateComponents: [], renderedBody: 'Hola' });
  });

  it('falls back to defaults and never sends empty values', () => {
    const inputTemplate: LeadTemplateRef = {
      name: 'fallbacks',
      language: 'es',
      bodyText: '{{a}} {{b}} {{c}} {{d}}',
      bindings: [
        { variable: 'a', component: 'body', format: 'named', source: 'customer_first_name' },
        { variable: 'b', component: 'body', format: 'named', source: 'project_title' },
        { variable: 'c', component: 'body', format: 'named', source: 'static', staticValue: '   ' },
        { variable: 'd', component: 'body', format: 'named', source: 'assistant_name' },
      ],
    };
    const actual = service.executeRender(inputTemplate, {
      assistantName: '',
      businessName: 'La Ceiba',
    });
    expect(actual.templateComponents[0].parameters).toEqual([
      { type: 'text', text: 'Cliente', parameter_name: 'a' },
      { type: 'text', text: 'La Ceiba', parameter_name: 'b' },
      { type: 'text', text: '-', parameter_name: 'c' },
      { type: 'text', text: '-', parameter_name: 'd' },
    ]);
    expect(actual.renderedBody).toBe('Cliente La Ceiba - -');
  });
});
