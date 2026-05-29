import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchCustomersAutocompleteQueryDto } from './dto/search-customers-autocomplete.query.dto';
import { Customer, type CustomerDocument } from './schemas/customer.schema';
import { type CustomerAutocompleteItem } from './types/customer-autocomplete-item.type';

const DEFAULT_AUTOCOMPLETE_LIMIT = 20;

type CustomerAutocompleteLeanRow = {
  readonly _id: { toString(): string };
  readonly name?: string;
  readonly lastName?: string;
  readonly phone: string;
  readonly document?: string;
  readonly email?: string;
};

/**
 * Lightweight customer search for admin autocomplete pickers.
 * Matches by `name`, `lastName`, `phone`, `email`, `document` (case-insensitive).
 */
@Injectable()
export class CustomerAutocompleteService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
  ) {}

  async searchByText(
    query: SearchCustomersAutocompleteQueryDto,
  ): Promise<CustomerAutocompleteItem[]> {
    const trimmed = query.q.trim();
    if (trimmed === '') {
      return [];
    }
    const limit = query.limit ?? DEFAULT_AUTOCOMPLETE_LIMIT;
    const rx = new RegExp(this.escapeRegex(trimmed), 'i');
    const docs = await this.customerModel
      .find({
        $or: [
          { name: rx },
          { lastName: rx },
          { phone: rx },
          { email: rx },
          { document: rx },
        ],
      })
      .select('_id name lastName phone document email')
      .limit(limit)
      .lean<CustomerAutocompleteLeanRow[]>()
      .exec();
    return docs.map((doc) => this.mapItem(doc));
  }

  private mapItem(doc: CustomerAutocompleteLeanRow): CustomerAutocompleteItem {
    return {
      id: String(doc._id),
      name: doc.name,
      lastName: doc.lastName,
      phone: doc.phone,
      document: doc.document,
      email: doc.email,
    };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
