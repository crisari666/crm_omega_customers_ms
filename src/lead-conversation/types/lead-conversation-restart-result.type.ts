/** `POST /admin/customer/lead-conversations/sessions/:sessionId/restart` response. */
export type LeadConversationRestartResult = {
  readonly restarted: true;
  /** False when the last inbound is outside Meta's 24h window: the flow restarts on the next customer message. */
  readonly sent: boolean;
  readonly reason?: 'outside_customer_service_window';
};
