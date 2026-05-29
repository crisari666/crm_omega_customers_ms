import { buildMarketingTemplateComponents } from './build-marketing-template-components.util';

describe('buildMarketingTemplateComponents', () => {
  it('returns undefined when no header media and no body components', () => {
    expect(buildMarketingTemplateComponents({})).toBeUndefined();
  });

  it('builds image header from media id', () => {
    const actual = buildMarketingTemplateComponents({
      templateHeaderMediaId: ' 123456 ',
      templateHeaderMediaType: 'image',
    });
    expect(actual).toEqual([
      {
        type: 'header',
        parameters: [{ type: 'image', image: { id: '123456' } }],
      },
    ]);
  });

  it('builds video header from media id', () => {
    const actual = buildMarketingTemplateComponents({
      templateHeaderMediaId: 'vid-1',
      templateHeaderMediaType: 'video',
    });
    expect(actual).toEqual([
      {
        type: 'header',
        parameters: [{ type: 'video', video: { id: 'vid-1' } }],
      },
    ]);
  });

  it('merges body components and replaces stored header', () => {
    const actual = buildMarketingTemplateComponents({
      templateHeaderMediaId: 'img-99',
      templateComponents: [
        { type: 'header', parameters: [{ type: 'image', image: { link: 'https://x' } }] },
        {
          type: 'body',
          parameters: [{ type: 'text', text: 'Hola', parameter_name: 'name' }],
        },
      ],
    });
    expect(actual).toEqual([
      {
        type: 'header',
        parameters: [{ type: 'image', image: { id: 'img-99' } }],
      },
      {
        type: 'body',
        parameters: [{ type: 'text', text: 'Hola', parameter_name: 'name' }],
      },
    ]);
  });
});
