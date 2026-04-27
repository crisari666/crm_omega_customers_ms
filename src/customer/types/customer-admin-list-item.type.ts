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
  /** Current pipeline step id when set. */
  customerStepId?: string;
  /** Current pipeline step label for customer. */
  currentStep?: string;
  /** Hex or CSS color from customer_steps catalog when available. */
  currentStepColor?: string;
  /** False when customer disabled; true when active or legacy doc without field. */
  enabled: boolean;
  createdAt: string;
};

export type CustomerStepDistributionItem = {
  customerStepId: string | null;
  name: string;
  color?: string;
  count: number;
};

export type CustomerAdminListResponse = {
  items: CustomerAdminListItem[];
  total: number;
  stepDistribution: CustomerStepDistributionItem[];
};
