export type ImportCustomerAdminResultItem =
  | { phone: string; status: 'created'; customerId: string }
  | { phone: string; status: 'already_exists'; customerId: string }
  | { phone: string; status: 'error'; message: string };

export type ImportCustomersAdminResponse = {
  results: ImportCustomerAdminResultItem[];
};
