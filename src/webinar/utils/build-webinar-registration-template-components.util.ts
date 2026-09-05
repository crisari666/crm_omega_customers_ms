import {
  WEBINAR_REGISTRATION_BODY_PARAM_ORDER,
} from '../constants/webinar-notification.constants';

export type WebinarRegistrationTemplateFields = {
  readonly dayLabel: string;
  readonly dateText: string;
  readonly timeText: string;
  readonly meetLink: string;
};

/**
 * Builds Meta template body components for `webinar_notification_`.
 */
export function buildWebinarRegistrationTemplateComponents(
  fields: WebinarRegistrationTemplateFields,
): Record<string, unknown>[] {
  const valuesByParam: Record<(typeof WEBINAR_REGISTRATION_BODY_PARAM_ORDER)[number], string> = {
    day: fields.dayLabel,
    date_webinar: fields.dateText,
    date_webinar_2: fields.dateText,
    time: fields.timeText,
    link_webinar: fields.meetLink,
  };
  return [
    {
      type: 'body',
      parameters: WEBINAR_REGISTRATION_BODY_PARAM_ORDER.map((parameterName) => ({
        type: 'text',
        text: valuesByParam[parameterName],
        parameter_name: parameterName,
      })),
    },
  ];
}
