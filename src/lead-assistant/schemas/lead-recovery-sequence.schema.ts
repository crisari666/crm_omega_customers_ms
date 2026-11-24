import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LEAD_RECOVERY_SEQUENCE_KEY } from '../constants/lead-assistant.constants';
import { LeadRecoveryStepEmbedded, LeadRecoveryStepEmbeddedSchema } from './lead-recovery-step-embedded.schema';

export type LeadRecoverySequenceDocument = HydratedDocument<LeadRecoverySequence>;

/** Singleton (`key: 'default'`) with the follow-up templates sent to silent leads. */
@Schema({ timestamps: true, collection: 'lead_recovery_sequences' })
export class LeadRecoverySequence {
  @Prop({ type: String, required: true, unique: true, default: LEAD_RECOVERY_SEQUENCE_KEY })
  key: string;

  @Prop({ type: [LeadRecoveryStepEmbeddedSchema], default: [] })
  steps: LeadRecoveryStepEmbedded[];
}

export const LeadRecoverySequenceSchema = SchemaFactory.createForClass(LeadRecoverySequence);
