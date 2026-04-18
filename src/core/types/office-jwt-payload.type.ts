/**
 * JWT payload issued by office back (RS256). See jwt-public-key-microservices.md.
 */
export interface OfficeJwtPayload {
  readonly sub?: string;
  readonly userId?: string;
  readonly level?: number;
  readonly role?: string;
  readonly iat?: number;
  readonly exp?: number;
}
