import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Embedded shape of `LeadFaqProjectAnswer`. */
@Schema({ _id: false })
export class LeadFaqProjectAnswerEmbedded {
  @Prop({ type: String, required: true })
  projectId: string;

  @Prop({ type: String, default: '' })
  projectTitle: string;

  @Prop({ type: String, required: true })
  answer: string;
}

export const LeadFaqProjectAnswerEmbeddedSchema = SchemaFactory.createForClass(LeadFaqProjectAnswerEmbedded);
