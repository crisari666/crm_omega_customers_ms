export type CustomerStepResponse = {
  id: string;
  name: string;
  description?: string;
  order: number;
  color?: string;
  isActive: boolean;
  isPotentialBuyer: boolean;
  createdAt: string;
  updatedAt: string;
};
