import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetaLeadForm, MetaLeadFormDocument } from './schemas/meta-lead-form.schema';
import type { MetaLeadFormFlowStrategy } from './types/meta-lead-form-flow-strategy.type';

export type MetaLeadFormMatch = {
  readonly id: string;
  readonly formId: string;
  readonly formName: string;
  readonly flowStrategy: MetaLeadFormFlowStrategy;
};

/**
 * Resolves an enabled registry row by Meta form id (preferred) or form name.
 */
@Injectable()
export class MetaLeadFormLookupService {
  constructor(
    @InjectModel(MetaLeadForm.name)
    private readonly metaLeadFormModel: Model<MetaLeadFormDocument>,
  ) {}

  async executeFindEnabled(input: {
    readonly formId?: string;
    readonly formName?: string;
  }): Promise<MetaLeadFormMatch | null> {
    const formId = (input.formId ?? '').trim();
    if (formId.length > 0) {
      const byId = await this.metaLeadFormModel
        .findOne({ formId, enabled: true })
        .lean()
        .exec();
      if (byId != null) {
        return this.mapMatch(byId);
      }
    }
    const formName = (input.formName ?? '').trim();
    if (formName.length === 0) {
      return null;
    }
    const byName = await this.metaLeadFormModel
      .findOne({
        enabled: true,
        formName: new RegExp(`^${escapeRegExp(formName)}$`, 'i'),
      })
      .lean()
      .exec();
    if (byName == null) {
      return null;
    }
    return this.mapMatch(byName);
  }

  private mapMatch(doc: {
    readonly _id: { toString(): string };
    readonly formId: string;
    readonly formName: string;
    readonly flowStrategy: MetaLeadFormFlowStrategy;
  }): MetaLeadFormMatch {
    return {
      id: String(doc._id),
      formId: doc.formId,
      formName: doc.formName,
      flowStrategy: doc.flowStrategy,
    };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
