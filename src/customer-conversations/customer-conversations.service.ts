import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { normalizeCustomerPhone } from '../customer/utils/normalize-customer-phone.util';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import { CustomersWhatsappMessageUpsertV1 } from './models/customers-whatsapp-message-upsert-v1.model';
import {
  CustomerWhatsappChat,
  CustomerWhatsappChatDocument,
} from './schemas/customer-whatsapp-chat.schema';
import {
  CustomerWhatsappMessage,
  CustomerWhatsappMessageDocument,
} from './schemas/customer-whatsapp-message.schema';
import {
  CustomerWhatsappUnresolved,
  CustomerWhatsappUnresolvedDocument,
} from './schemas/customer-whatsapp-unresolved.schema';

@Injectable()
export class CustomerConversationsService {
  private readonly logger: Logger = new Logger(CustomerConversationsService.name);

  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerWhatsappChat.name)
    private readonly customerWhatsappChatModel: Model<CustomerWhatsappChatDocument>,
    @InjectModel(CustomerWhatsappMessage.name)
    private readonly customerWhatsappMessageModel: Model<CustomerWhatsappMessageDocument>,
    @InjectModel(CustomerWhatsappUnresolved.name)
    private readonly customerWhatsappUnresolvedModel: Model<CustomerWhatsappUnresolvedDocument>,
  ) {}

  async executeUpsertFromEvent(payload: CustomersWhatsappMessageUpsertV1): Promise<void> {
    const customerId: string | null = await this.resolveCustomerId(payload);
    if (!customerId) {
      await this.saveUnresolvedEvent(payload);
      return;
    }
    const customerObjectId: Types.ObjectId = new Types.ObjectId(customerId);
    await this.customerWhatsappChatModel.updateOne(
      { sessionId: payload.sessionId, chatId: payload.chat.chatId },
      {
        $set: {
          sessionId: payload.sessionId,
          chatId: payload.chat.chatId,
          customerId: customerObjectId,
          name: payload.chat.name ?? '',
          isGroup: payload.chat.isGroup,
          userSessionId: payload.chat.userSessionId ?? null,
          lastMessageTimestamp: payload.message.timestamp,
        },
      },
      { upsert: true },
    );
    await this.customerWhatsappMessageModel.updateOne(
      { sessionId: payload.sessionId, messageId: payload.message.messageId },
      {
        $set: {
          sessionId: payload.sessionId,
          messageId: payload.message.messageId,
          chatId: payload.chat.chatId,
          customerId: customerObjectId,
          fromMe: payload.message.fromMe,
          body: payload.message.body,
          type: payload.message.type,
          timestamp: payload.message.timestamp,
          hasMedia: payload.message.hasMedia,
          mediaType: payload.message.mediaType ?? null,
          mediaPath: payload.message.mediaPath ?? null,
          mediaMimeType: payload.message.mediaMimeType ?? null,
          mediaFilename: payload.message.mediaFilename ?? null,
          syncMode: payload.syncMode,
        },
      },
      { upsert: true },
    );
  }

  /**
   * Upserts chat + message for Meta CRM gateway ingest (stable sessionId / chatId).
   */
  async executeUpsertFromMetaIngress(params: {
    readonly sessionId: string;
    readonly chatId: string;
    readonly customerId: Types.ObjectId;
    readonly contactName: string;
    readonly crmMessage: boolean;
    readonly message: {
      readonly messageId: string;
      readonly fromMe: boolean;
      readonly body: string;
      readonly type: string;
      readonly timestamp: number;
      readonly hasMedia: boolean;
      readonly mediaType?: string | null;
      readonly mediaPath?: string | null;
      readonly mediaMimeType?: string | null;
      readonly mediaFilename?: string | null;
    };
  }): Promise<void> {
    await this.customerWhatsappChatModel.updateOne(
      { sessionId: params.sessionId, chatId: params.chatId },
      {
        $set: {
          sessionId: params.sessionId,
          chatId: params.chatId,
          customerId: params.customerId,
          name: params.contactName,
          isGroup: false,
          userSessionId: null,
          crmMessage: params.crmMessage,
          lastMessageTimestamp: params.message.timestamp,
        },
      },
      { upsert: true },
    );
    await this.customerWhatsappMessageModel.updateOne(
      { sessionId: params.sessionId, messageId: params.message.messageId },
      {
        $set: {
          sessionId: params.sessionId,
          messageId: params.message.messageId,
          chatId: params.chatId,
          customerId: params.customerId,
          fromMe: params.message.fromMe,
          body: params.message.body,
          type: params.message.type,
          timestamp: params.message.timestamp,
          hasMedia: params.message.hasMedia,
          mediaType: params.message.mediaType ?? null,
          mediaPath: params.message.mediaPath ?? null,
          mediaMimeType: params.message.mediaMimeType ?? null,
          mediaFilename: params.message.mediaFilename ?? null,
          syncMode: 'live',
        },
      },
      { upsert: true },
    );
  }

  async findChatsByCustomerId(params: {
    customerId: string;
    limit?: number;
    skip?: number;
  }): Promise<
    {
      sessionId: string;
      chatId: string;
      name: string;
      isGroup: boolean;
      lastMessageTimestamp: number;
    }[]
  > {
    const limit: number = params.limit ?? 50;
    const skip: number = params.skip ?? 0;
    return this.customerWhatsappChatModel
      .find({ customerId: new Types.ObjectId(params.customerId) })
      .sort({ lastMessageTimestamp: -1 })
      .limit(limit)
      .skip(skip)
      .select('sessionId chatId name isGroup lastMessageTimestamp')
      .lean()
      .exec();
  }

  async findMessagesByCustomerIdAndChatId(params: {
    customerId: string;
    chatId: string;
    limit?: number;
    skip?: number;
  }): Promise<
    {
      sessionId: string;
      messageId: string;
      chatId: string;
      body: string;
      fromMe: boolean;
      type: string;
      timestamp: number;
      hasMedia: boolean;
      mediaType?: string | null;
      mediaPath?: string | null;
      mediaFilename?: string | null;
      mediaMimeType?: string | null;
      mediaUrl?: string | null;
    }[]
  > {
    const mediaBaseUrl: string = this.resolveMediaBaseUrl();
    const limit: number = params.limit ?? 100;
    const skip: number = params.skip ?? 0;
    const rows = await this.customerWhatsappMessageModel
      .find({
        customerId: new Types.ObjectId(params.customerId),
        chatId: params.chatId,
      })
      .sort({ timestamp: 1 })
      .limit(limit)
      .skip(skip)
      .select(
        'sessionId messageId chatId body fromMe type timestamp hasMedia mediaType mediaPath mediaFilename mediaMimeType',
      )
      .lean()
      .exec();
    return rows.map((row) => ({
      sessionId: row.sessionId,
      messageId: row.messageId,
      chatId: row.chatId,
      body: row.body,
      fromMe: row.fromMe,
      type: row.type,
      timestamp: row.timestamp,
      hasMedia: row.hasMedia,
      mediaType: row.mediaType ?? null,
      mediaPath: row.mediaPath ?? null,
      mediaFilename: row.mediaFilename ?? null,
      mediaMimeType: row.mediaMimeType ?? null,
      mediaUrl: row.mediaPath ? `${mediaBaseUrl}/${row.mediaPath}` : null,
    }));
  }

  private resolveMediaBaseUrl(): string {
    const raw: string = (process.env.WHATSAPP_MS_MEDIA_BASE_URL ?? '').trim();
    if (raw !== '') {
      return raw.replace(/\/$/, '');
    }
    return 'http://localhost:3000/ws-rest/media';
  }

  private async resolveCustomerId(
    payload: CustomersWhatsappMessageUpsertV1,
  ): Promise<string | null> {
    if (payload.identity.customerId && Types.ObjectId.isValid(payload.identity.customerId)) {
      return payload.identity.customerId;
    }
    const fromPhone: string = normalizeCustomerPhone(payload.identity.fromPhone ?? '');
    const toPhone: string = normalizeCustomerPhone(payload.identity.toPhone ?? '');
    const candidateSet: Set<string> = new Set<string>();
    if (fromPhone) {
      candidateSet.add(fromPhone);
      candidateSet.add(fromPhone.replace(/\D/g, ''));
    }
    if (toPhone) {
      candidateSet.add(toPhone);
      candidateSet.add(toPhone.replace(/\D/g, ''));
    }
    const candidates: string[] = [...candidateSet].filter((value: string) => value !== '');
    if (candidates.length === 0) {
      return null;
    }
    const customer = await this.customerModel
      .findOne({
        $or: [{ phone: { $in: candidates } }, { whatsapp: { $in: candidates } }],
      })
      .select('_id')
      .lean()
      .exec();
    return customer?._id ? String(customer._id) : null;
  }

  private async saveUnresolvedEvent(
    payload: CustomersWhatsappMessageUpsertV1,
  ): Promise<void> {
    try {
      await this.customerWhatsappUnresolvedModel.updateOne(
        { sessionId: payload.sessionId, messageId: payload.message.messageId },
        {
          $set: {
            sessionId: payload.sessionId,
            messageId: payload.message.messageId,
            chatId: payload.chat.chatId,
            fromPhone: payload.identity.fromPhone ?? null,
            toPhone: payload.identity.toPhone ?? null,
            payload,
          },
        },
        { upsert: true },
      );
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed unresolved upsert: ${message}`);
    }
  }
}
