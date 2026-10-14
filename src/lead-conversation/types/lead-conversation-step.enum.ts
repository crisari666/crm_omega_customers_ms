/** Conversation state machine steps (persisted on the session). */
export enum LeadConversationStep {
  Initial = 'initial',
  AskProject = 'ask_project',
  AskLotRange = 'ask_lot_range',
  AskPayment = 'ask_payment',
  AskSchedule = 'ask_schedule',
  AskCallSlot = 'ask_call_slot',
  ReminderSent = 'reminder_sent',
  Scheduled = 'scheduled',
  Closed = 'closed',
}
