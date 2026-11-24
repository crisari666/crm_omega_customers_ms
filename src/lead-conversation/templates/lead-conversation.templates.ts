/**
 * Copy of the AI lead qualification conversation (Spanish, WhatsApp formatting).
 * Placeholders: {{name_suffix}} (", Ana" or ""), {{brand}}, {{location}}, {{project_name}},
 * {{project_short_description}}, {{lot_lines}}, {{periodo}}, {{fecha_llamada}}.
 */
export const LEAD_TEMPLATES = {
  askProject:
    '¡Hola{{name_suffix}}! 👋 Bienvenido a {{brand}}.\n\n' +
    'Soy el asistente del equipo comercial. Te ayudo a\n' +
    'encontrar el lote ideal para ti en {{location}}.\n\n' +
    '¿Cuál te gustaría conocer?',
  askProjectListButton: 'Ver proyectos',
  /** Body for V2 mid-chat project picker (no full welcome). */
  askProjectPicker:
    'Para brindarte la mejor información posible, Tenemos diferentes proyectos y quisiera orientarte sobre el que más te interese. ¿Cuál te gustaría conocer?',
  allProjectsOption: '✨ Me interesan todos',
  /** Attractive V2 project teaser after the customer picks a project (`shortDescription` from omega_rag). */
  projectTeaserV2: 'Perfecto. 🌿 {{project_name}}\n\n{{project_short_description}}',
  /** Fallback when the project has no shortDescription. */
  projectTeaserV2NameOnly: 'Perfecto. 🌿 {{project_name}}',
  /**
   * Appended to the configured greeting on the first inbound when a project is already related
   * (campaign soft-suggest or confirmed session project).
   */
  greetingProjectConfirm: 'Veo que te interesó {{project_name}}, ¿es así?',
  /** Full ask when motivation buttons are the sole outbound. */
  askMotivationPicker: '¿Lo estás mirando para construir, como inversión, o solo explorando?',
  /** Short body when a text reply already asked / acknowledged before the buttons. */
  askMotivationChoice: 'Para orientarte mejor, indícame el motivo de compra:',
  motivationBuildOption: '🏗️ Construir',
  motivationInvestOption: '📈 Inversión',
  motivationExploringOption: '👀 Solo explorando',
  askTimeToBuyPicker:
    'Para acompañarte en el proceso de compra, ¿cuál es tu plazo para adquirir el lote?',
  askTimeToBuyChoice: 'Para orientarte mejor, indícame tu plazo de compra:',
  timeImmediateOption: 'Compra inmediata',
  timeWithin30DaysOption: 'Compra en 30 días',
  timeWithin3MonthsOption: 'Compra en 3 meses',
  timeFutureOption: 'Compra futura',
  timeNotNowOption: 'No comprar ahora',
  askTimeToBuyListButton: 'Ver plazos',
  askPaymentCapturePicker: 'Para prepararte una propuesta clara, ¿cómo te gustaría pagar?',
  askPaymentCaptureChoice: 'Para orientarte mejor, indícame la forma de pago:',
  paymentCashAndFinancingOption: 'Contado y financiación',
  paymentSubsidyOption: 'Subsidio',
  askUrgencyPicker: '¿Qué tan urgente es para ti avanzar con esta compra?',
  askUrgencyChoice: 'Para priorizar tu acompañamiento, indícame el nivel de urgencia:',
  urgencyLowOption: 'Baja',
  urgencyMediumOption: 'Media',
  urgencyHighOption: 'Alta',
  askDecisionMakerPicker: '¿Quién toma la decisión final de compra?',
  askDecisionMakerChoice: 'Para coordinar bien la asesoría, indícame quién decide:',
  decisionSelfOption: 'Yo',
  decisionSpouseOption: 'Cónyuge',
  decisionFamilyOption: 'Familia',
  decisionOtherOption: 'Otro',
  askDecisionMakerListButton: 'Ver opciones',
  financingIntro:
    'Los lotes en {{project_name}} pueden financiarse con cuotas mensuales desde {{monthly}}.',
  financingLotPickerBody:
    'Perfecto, en {{project_name}} contamos con planes financiados para nuestros lotes con planes desde:\n{{lot_lines}}\n\n¿Cuál te interesa?',
  financingLotPickerLine: '- {{area}} m²: *{{monthly}}* pesos mensuales',
  financingLotLine: '{{area}} m² · cuotas desde {{monthly}} al mes',
  financingLotLineWithPrice: '{{area}} m² · {{price}} · cuotas desde {{monthly}} al mes',
  financingLotOptionTitle: '{{area}} m²',
  financingLotOptionDescription: '{{monthly}}/mes',
  financingLotPickerListButton: 'Ver lotes',
  financingTerms:
    'Separas tu lote con {{separation}} y el saldo lo pagas hasta en {{installments}} cuotas mensuales, con financiación directa, sin intereses y sin pasar por el banco.',
  financingTermsNoSeparation:
    'Puedes pagar el saldo hasta en {{installments}} cuotas mensuales, con financiación directa, sin intereses y sin pasar por el banco.',
  /** Body when financing data is missing; schedule follows. */
  financingMissingFallback:
    'Un asesor te detalla las cuotas mensuales según el lote. Te agendo la llamada.',
  /** After the customer picks a financed lot size. */
  lotChoiceAck:
    'Excelente elección el de {{area}} m². Esa cuota mensual te da un camino claro para avanzar.',
  askNextStep:
    '¿Tienes alguna otra duda, o prefieres que un asesor comercial te acompañe para avanzar con tu lote?',
  askNextStepShort: '¿Te ayudo con algo más o te agendo la llamada con el asesor?',
  offerCallNoAnswer:
    'Ese detalle te lo explica mejor un asesor comercial en una llamada corta. ¿Te la agendo?',
  nextStepQuestionOption: 'Tengo otra duda',
  nextStepCallOption: 'Hablar con asesor',
  askYourQuestion: 'Claro, cuéntame tu duda y te ayudo.',
  projectIntro: '¡Hola{{name_suffix}}! 👋 Bienvenido a {{brand}}.\n\n🌿 {{project_name}}\n\n{{project_short_description}}',
  planCaption: 'Aquí tienes el plano del condominio 👇\nAsí puedes ver cómo está distribuido.',
  lotRanges:
    'Estos son los tamaños de lote disponibles:\n\n{{lot_lines}}\n\n' +
    'Todos con financiación directa, sin intereses\ny sin pasar por el banco.\n\n' +
    '¿Cuál rango te interesa más?',
  lotRangesListButton: 'Ver tamaños',
  lotLine: '📐 {{area}} m² · desde {{price}}',
  askPayment:
    '¡Qué buena elección{{name_suffix}}! 🙌✨\n\n' +
    'Ese lote puede ser el comienzo de algo muy especial\npara ti y tu familia 🏡💛\n\n' +
    'Queremos que hacerlo realidad sea fácil y cómodo,\nasí que cuéntanos:\n\n' +
    '💳 ¿Cómo te gustaría hacer tu compra?',
  paymentFinancedOption: '💰 Financiado',
  paymentCashOption: '💵 De contado',
  scheduleLeadFinanced:
    'Perfecto. Tenemos financiación directa con la\nconstructora, sin intereses y sin pasar por el banco.',
  scheduleLeadCash: 'Perfecto. Pagar de contado te da ventajas especiales\nque el asesor te puede explicar.',
  askSchedule:
    'Para darte el valor exacto de tu cuota y las\nubicaciones disponibles, un asesor te va a llamar.\n' +
    'Es una llamada corta, de 5 minutos 📞\n\n' +
    'Estos son nuestros horarios de llamada:\n' +
    '🌅 Mañana: 9:00 a. m. a 12:00 m.\n' +
    '☀️ Tarde: 2:00 p. m. a 5:00 p. m.\n' +
    '🌙 Noche: 6:00 p. m. a 9:00 p. m.\n\n' +
    '¿En qué horario te queda mejor que te llamemos?',
  slotMorningOption: 'En la Mañana 9-12',
  slotAfternoonOption: 'Tarde 2-5',
  slotNightOption: 'Noche 6-9',
  askCallSlot:
    '¡Perfecto! 🙌 Estos son los espacios disponibles para tu llamada ({{periodo}}).\n\n' +
    'Elige el que mejor te quede 👇',
  askCallSlotListButton: 'Ver horarios',
  noCallSlots:
    'En este momento no tenemos espacios libres en ese horario 😕\nPor favor elige otro horario 👇',
  callSlotTaken: 'Ese espacio acaba de ser tomado 😅\nTe comparto los horarios que siguen libres 👇',
  confirmation:
    '¡Listo{{name_suffix}}! 🎉✅\n\nTu llamada quedó agendada 📞\n🗓️ {{fecha_llamada}}\n' +
    '📱 Te llamamos a este mismo número\n⏱️ Dura solo 5 minutos\n\n' +
    '{{asesor}} de {{brand}} te va a contar todo sobre tu\nfuturo lote 🏡💛\n\n¿Todo bien con este horario?',
  confirmationWithContact:
    '¡Listo{{name_suffix}}! 🎉✅\n\nTu llamada quedó agendada 📞\n🗓️ {{fecha_llamada}}\n' +
    '📱 Te llamamos a este mismo número\n⏱️ Dura solo 5 minutos\n\n' +
    'Tu asesor {{asesor}} de {{brand}} te va a acompañar 🏡💛\n' +
    'Te comparto su ficha de contacto para que lo guardes y le escribas cuando quieras 👇',
  reminder:
    'Hola! Queremos asesorarte de la forma más profesional 🏡\n\n¿Quieres agendar llamada con uno de nuestros asesores?',
  reminderYesOption: 'Sí',
  reminderNoOption: 'No',
  reminderDeclined:
    'Entendido{{name_suffix}}. Gracias por tu tiempo 🙏\nSi más adelante quieres información, escríbenos por aquí.',
  retryPrefix: 'Para continuar, por favor elige una de las opciones 👇',
} as const;

/** Emojis rotated over the project list (catalog titles come from omega_rag). */
export const PROJECT_LIST_EMOJIS = ['🌿', '🏛️', '💧', '🌄', '🏡', '🌳', '⛰️', '🌅'] as const;
