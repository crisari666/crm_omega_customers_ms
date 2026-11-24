import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import {
  LEAD_CONVERSATION_TEMPLATES_LIST_PATTERN,
  LEAD_WS_MS_CLIENT,
} from '../lead-conversation/constants/lead-conversation.constants';
import { LEAD_TEMPLATES_CACHE_TTL_MS } from './constants/lead-assistant.constants';
import type { LeadTemplatesListResult } from './types/lead-templates-list-result.type';
import type { LeadTemplatesResponse } from './types/lead-templates-response.type';

const TEMPLATES_RPC_TIMEOUT_MS = 15000;

type CachedTemplates = {
  readonly response: LeadTemplatesResponse;
  readonly expiresAt: number;
};

/**
 * Approved WhatsApp templates of the leads line, fetched over RPC and cached 5 minutes in memory.
 * Failures are reported in `error` (never thrown) and are not cached.
 */
@Injectable()
export class LeadTemplatesService {
  private readonly logger = new Logger(LeadTemplatesService.name);

  private cache: CachedTemplates | null = null;

  constructor(@Inject(LEAD_WS_MS_CLIENT) private readonly wsMsClient: ClientProxy) {}

  async executeList(refresh = false): Promise<LeadTemplatesResponse> {
    if (!refresh && this.cache != null && this.cache.expiresAt > Date.now()) {
      return this.cache.response;
    }
    const response = await this.fetchTemplates();
    if (response.error == null) {
      this.cache = { response, expiresAt: Date.now() + LEAD_TEMPLATES_CACHE_TTL_MS };
    }
    return response;
  }

  private async fetchTemplates(): Promise<LeadTemplatesResponse> {
    const fetchedAt = new Date().toISOString();
    try {
      const result = await lastValueFrom(
        this.wsMsClient
          .send<LeadTemplatesListResult>(LEAD_CONVERSATION_TEMPLATES_LIST_PATTERN, {})
          .pipe(timeout(TEMPLATES_RPC_TIMEOUT_MS)),
      );
      return this.mapResult(result, fetchedAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Lead templates RPC failed: ${message}`);
      return { templates: [], fetchedAt, error: message };
    }
  }

  private mapResult(result: LeadTemplatesListResult, fetchedAt: string): LeadTemplatesResponse {
    return {
      templates: result.templates ?? [],
      ...(result.phoneNumberId != null ? { phoneNumberId: result.phoneNumberId } : {}),
      fetchedAt,
      ...(result.success ? {} : { error: result.error ?? 'No se pudo consultar las plantillas' }),
    };
  }
}
