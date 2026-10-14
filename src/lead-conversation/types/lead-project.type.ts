export type LeadProjectLotOption = {
  readonly area: number;
  readonly price: number;
};

/** Project projection cached from omega_rag `GET /rag/projects`. */
export type LeadProject = {
  readonly id: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly plane: string;
  readonly lotOptions: readonly LeadProjectLotOption[];
};
