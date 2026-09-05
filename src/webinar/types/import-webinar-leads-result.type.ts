export type ImportWebinarLeadResultItem =
  | {
      readonly phone: string;
      readonly status: 'created';
      readonly leadId: string;
      readonly notificationSent: boolean;
    }
  | {
      readonly phone: string;
      readonly status: 'already_exists';
      readonly leadId: string;
    }
  | {
      readonly phone: string;
      readonly status: 'error';
      readonly message: string;
    };

export type ImportWebinarLeadsResponse = {
  readonly results: ImportWebinarLeadResultItem[];
  readonly created: number;
  readonly alreadyExists: number;
  readonly errors: number;
  readonly notificationsSent: number;
};
