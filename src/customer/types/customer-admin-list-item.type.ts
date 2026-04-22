/**
 * Minimal customer fields for admin CRM table (list projection).
 */
export type CustomerAdminListItem = {
  id: string;
  name?: string;
  lastName?: string;
  phone: string;
  email?: string;
  assignedTo?: string;
  /** Office user id who created the customer record. */
  createdBy?: string;
  /** False when customer disabled; true when active or legacy doc without field. */
  enabled: boolean;
  createdAt: string;
};

export type CustomerAdminListResponse = {
  items: CustomerAdminListItem[];
  total: number;
};
