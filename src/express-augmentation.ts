import type { OfficeJwtPayload } from './core/types/office-jwt-payload.type';

declare module 'express-serve-static-core' {
  interface Request {
    officeJwtUser?: OfficeJwtPayload;
  }
}

export {};
