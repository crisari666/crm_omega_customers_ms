import { Injectable } from '@nestjs/common';

/**
 * Business logic for customer domain.
 */
@Injectable()
export class CustomerService {
  /**
   * Returns a fixed value for smoke checks.
   */
  executePing(): string {
    return 'ok';
  }
}
