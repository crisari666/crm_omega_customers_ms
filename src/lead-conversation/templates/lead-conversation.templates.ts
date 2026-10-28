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
    '¿Cuál proyecto te interesa?',
  askProjectListButton: 'Ver proyectos',
  allProjectsOption: '✨ Me interesan todos',
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
