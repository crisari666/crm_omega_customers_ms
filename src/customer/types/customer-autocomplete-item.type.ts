/** Lightweight customer projection for admin autocomplete pickers. */
export type CustomerAutocompleteItem = {
  readonly id: string;
  readonly name?: string;
  readonly lastName?: string;
  readonly phone: string;
  readonly document?: string;
  readonly email?: string;
};
