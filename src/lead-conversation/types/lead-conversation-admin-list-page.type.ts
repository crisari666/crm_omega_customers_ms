import type { LeadConversationAdminListItem } from './lead-conversation-admin-list-item.type';

/** `GET /admin/customer/lead-conversations/sessions` response. */
export type LeadConversationAdminListPage = {
  readonly items: LeadConversationAdminListItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
};
