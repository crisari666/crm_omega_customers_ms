/** Escapes user input to be used literally inside a RegExp / Mongo `$regex`. */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
