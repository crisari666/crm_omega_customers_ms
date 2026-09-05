import { buildWebinarRegistrationTemplateComponents } from './build-webinar-registration-template-components.util';

describe('buildWebinarRegistrationTemplateComponents', () => {
  it('builds named body parameters in template order', () => {
    const actual = buildWebinarRegistrationTemplateComponents({
      dayLabel: 'Jueves',
      dateText: '10 de Septiembre',
      timeText: '7:45pm',
      meetLink: 'https://meet.google.com/abc',
    });
    expect(actual).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Jueves', parameter_name: 'day' },
          { type: 'text', text: '10 de Septiembre', parameter_name: 'date_webinar' },
          { type: 'text', text: '10 de Septiembre', parameter_name: 'date_webinar_2' },
          { type: 'text', text: '7:45pm', parameter_name: 'time' },
          {
            type: 'text',
            text: 'https://meet.google.com/abc',
            parameter_name: 'link_webinar',
          },
        ],
      },
    ]);
  });
});
